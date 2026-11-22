import type { FastifyPluginAsync } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { ResponseInput, ResponseStreamEvent } from 'openai/resources/responses/responses'
import type { SSEEvent, QueryInfo } from '@3iq/shared'
import { getBaseInstructions, getOpenAIClient } from '../agent/client.js'
import { generateTitle } from '../agent/title.js'
import { getModelCatalog, isApprovedModel } from '../agent/models.js'
import { AuthRequiredError, getFabricToken, isAuthEnabled } from '../auth/entra.js'
import { openFabricSession, type FabricSession } from '../mcp/fabricClient.js'
import { loadSkill } from '../skills/loader.js'
import { trackerFor } from '../mcp/sources.js'
import { timed } from '../observability/timing.js'
import {
  addMessage, createConversation, getConversation, isHistoryEnabled, logToolCall, saveConversation,
  type ConversationDoc,
} from '../store/cosmos.js'

const BodySchema = z.object({
  message: z.string().min(1).max(4000).describe('The user message'),
  skill: z.string().optional().describe('Skill id to activate for this request'),
  model: z.string().max(100).optional().describe('Approved model deployment id; defaults to the server default'),
  conversationId: z.string().uuid().optional().describe('Existing conversation to continue (when history is enabled)'),
  previousResponseId: z.string().regex(/^[\w-]{1,200}$/).optional().describe('Used only when history is disabled: response id of the previous turn'),
})

const makeTitle = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 60)

// ExecuteQuery takes a `daxQueries` array; accept a single string too in case the contract changes.
function extractDax(args: Record<string, unknown>): string[] {
  const found: string[] = []
  for (const [key, value] of Object.entries(args)) {
    if (!/query|dax/i.test(key)) continue
    if (typeof value === 'string') found.push(value)
    else if (Array.isArray(value)) found.push(...value.filter((v): v is string => typeof v === 'string'))
  }
  return found
}

const MAX_TOOL_ROUNDS = Math.max(1, parseInt(process.env.MAX_TOOL_ROUNDS ?? '12'))

const TOOL_STATUS: Record<string, string> = {
  DiscoverArtifacts: 'Finding reports and semantic models...',
  ResolveFabricItem: 'Resolving Fabric item...',
  GetReportMetadata: 'Reading report metadata...',
  GetSemanticModelSchema: 'Reading semantic model schema...',
  ValueSearch: 'Searching model values...',
  ExecuteQuery: 'Running query on semantic model...',
}

type ToolCall = { callId: string; name: string; arguments: string }
type Outcome =
  | { kind: 'completed'; responseId: string }
  | { kind: 'failed' }
  | { kind: 'action'; responseId: string; calls: ToolCall[] }

export const chatRoute: FastifyPluginAsync = async (app) => {
  app.withTypeProvider<ZodTypeProvider>().post(
    '/api/chat',
    { schema: { body: BodySchema } },
    async (request, reply) => {
      const requestStart = Date.now()
      let rounds = 0
      const { message, skill: skillId, model, conversationId, previousResponseId: continueFrom } = request.body
      const modelId = model ?? getModelCatalog().default
      if (!isApprovedModel(modelId)) {
        return reply.code(400).send({ error: 'Unknown model' })
      }

      // Load skill — falls back to 'default' if not specified or not found
      const skill = loadSkill(skillId ?? 'default')
      const isToolSkill = skill.allowedClients.length > 0
      const fabricAllowed = !isToolSkill || skill.allowedClients.includes('fabric-mcp')

      // Fabric IQ runs as the signed-in user, so sign-in is required whenever it is configured.
      const authEnabled = isAuthEnabled()
      const homeAccountId = request.session.homeAccountId
      if (authEnabled) {
        if (!homeAccountId) return reply.code(401).send({ error: 'auth_required' })
        try {
          await getFabricToken(homeAccountId)
        } catch (err) {
          if (err instanceof AuthRequiredError) return reply.code(401).send({ error: 'auth_required' })
          throw err
        }
      }

      // History is per user, so it needs sign-in as well as a Cosmos account.
      let conversation: ConversationDoc | null = null
      if (authEnabled && isHistoryEnabled() && homeAccountId) {
        try {
          if (conversationId) {
            conversation = await getConversation(homeAccountId, conversationId)
            if (!conversation) return reply.code(404).send({ error: 'Conversation not found' })
          } else {
            conversation = await createConversation(homeAccountId, makeTitle(message), modelId)
          }
        } catch (err) {
          request.log.error(err, 'Chat history unavailable')
        }
      }
      const conv = conversation
      const modelLabel = getModelCatalog().models.find(m => m.id === modelId)?.label
      const persist = (p: Promise<unknown>) => p.catch(err => request.log.error(err, 'Chat history write failed'))

      const openai = getOpenAIClient()
      // Runs alongside the first model round; the truncated message stays as the fallback title.
      const titlePromise = conv && !conversationId ? generateTitle(openai, modelId, message, conv.title) : null
      const instructions = [getBaseInstructions(), skill.body].filter(Boolean).join('\n\n')

      // Take over the raw HTTP response for SSE
      reply.hijack()
      reply.raw.setHeader('Content-Type', 'text/event-stream')
      reply.raw.setHeader('Cache-Control', 'no-cache')
      reply.raw.setHeader('Connection', 'keep-alive')
      reply.raw.flushHeaders()

      const abort = new AbortController()
      let clientGone = false
      reply.raw.on('close', () => {
        clientGone = true
        abort.abort()
      })

      const send = (event: SSEEvent) => {
        if (!clientGone) reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
      }

      let fabric: FabricSession | null = null

      try {
        if (conv) {
          send({ type: 'conversation', id: conv.id, title: conv.title })
          await persist(addMessage(conv.userId, conv.id, { role: 'user', content: message }))
        }
        if (authEnabled && fabricAllowed) {
          send({ type: 'status', label: 'Connecting to Fabric IQ...' })
          try {
            fabric = await timed(request.log, 'fabric.connect', {}, () =>
              openFabricSession(() => getFabricToken(homeAccountId!))
            )
          } catch (err) {
            request.log.error(err, 'Fabric IQ MCP connection failed')
            send({ type: 'error', message: 'Could not connect to Fabric IQ' })
            return
          }
        }
        if (isToolSkill) {
          send({ type: 'status', label: `Using ${skill.label} skill...` })
        }

        // Consumes one response stream; text is forwarded only when emitText is true.
        let answer = ''
        const queries: QueryInfo[] = []
        const sourceTracker = trackerFor(conv?.id)
        const consume = async (
          stream: AsyncIterable<ResponseStreamEvent>,
          emitText: boolean
        ): Promise<Outcome> => {
          const calls: ToolCall[] = []
          for await (const event of stream) {
            switch (event.type) {
              case 'response.output_text.delta':
                if (emitText && event.delta) {
                  answer += event.delta
                  send({ type: 'delta', content: event.delta })
                }
                break
              case 'response.output_item.done':
                if (event.item.type === 'function_call') {
                  calls.push({
                    callId: event.item.call_id,
                    name: event.item.name,
                    arguments: event.item.arguments,
                  })
                }
                break
              case 'response.completed':
                return calls.length > 0
                  ? { kind: 'action', responseId: event.response.id, calls }
                  : { kind: 'completed', responseId: event.response.id }
              case 'response.failed':
              case 'response.incomplete':
              case 'error':
                request.log.error({ event: event.type }, 'Model response did not complete')
                return { kind: 'failed' }
            }
          }
          return { kind: 'failed' }
        }

        // Instructions, model and tools are supplied per request; conversation state is chained
        // across tool rounds and across user turns with previous_response_id.
        let input: ResponseInput = [{ role: 'user', content: message }]
        let previousResponseId: string | undefined = conv ? conv.lastResponseId : continueFrom

        for (let round = 0; ; round++) {
          rounds = round + 1
          // Tool skills suppress the first round's preamble; the status events already signal activity.
          const outcome = await timed(request.log, 'model.response', { model: modelId, round }, async () => {
            const stream = await openai.responses.create(
              {
                model: modelId,
                instructions,
                input,
                previous_response_id: previousResponseId,
                tools: fabric?.tools,
                stream: true,
              },
              { signal: abort.signal }
            )
            return consume(stream, !(isToolSkill && round === 0))
          })

          if (outcome.kind === 'completed') {
            const sources = sourceTracker.list()
            if (sources.length > 0) send({ type: 'sources', sources })
            if (conv) {
              await persist((async () => {
                if (answer) {
                  await addMessage(conv.userId, conv.id, {
                    role: 'assistant',
                    content: answer,
                    modelLabel,
                    queries: queries.length > 0 ? queries : undefined,
                    sources: sources.length > 0 ? sources : undefined,
                  })
                }
                await saveConversation({
                  ...conv,
                  title: titlePromise ? await titlePromise : conv.title,
                  lastResponseId: outcome.responseId,
                  model: modelId,
                })
              })())
            }
            send({ type: 'done', responseId: outcome.responseId })
            break
          }
          if (outcome.kind === 'failed') {
            send({ type: 'error', message: 'Model response failed' })
            break
          }
          if (clientGone) break
          if (round >= MAX_TOOL_ROUNDS) {
            request.log.warn({ rounds: round }, 'Tool round limit reached')
            send({ type: 'error', message: 'The request needed too many steps. Try a more specific question.' })
            break
          }

          const outputs: ResponseInput = []
          for (const tc of outcome.calls) {
            send({ type: 'status', label: TOOL_STATUS[tc.name] ?? 'Querying Fabric data...' })
            const started = Date.now()
            let dax: string[] = []
            let args: Record<string, unknown> = {}
            let output: string
            if (!fabric) {
              output = '{"error":"Fabric IQ is not available for this request"}'
            } else {
              try {
                args = JSON.parse(tc.arguments || '{}')
                if (tc.name === 'ExecuteQuery') dax = extractDax(args)
                output = await timed(request.log, `fabric.${tc.name}`, { tool: tc.name, round }, () =>
                  fabric!.callTool(tc.name, args)
                )
                sourceTracker.record(tc.name, args, output)
              } catch (toolErr) {
                request.log.error({ err: toolErr, tool: tc.name }, 'Fabric IQ tool call failed')
                output = '{"error":"Tool call failed"}'
              }
            }
            for (const d of dax) {
              queries.push({ tool: tc.name, dax: d })
              send({ type: 'query', tool: tc.name, dax: d })
            }
            if (conv) {
              void persist(logToolCall({
                userId: conv.userId,
                username: request.session.username,
                conversationId: conv.id,
                model: modelId,
                tool: tc.name,
                dax: dax.length > 0 ? dax.join('\n\n') : undefined,
                arguments: tc.arguments.slice(0, 8000),
                ok: !output.startsWith('{"error"'),
                durationMs: Date.now() - started,
              }))
            }
            outputs.push({ type: 'function_call_output', call_id: tc.callId, output })
          }

          previousResponseId = outcome.responseId
          input = outputs
        }
      } catch (err) {
        if (!clientGone) {
          request.log.error(err, 'Chat stream error')
          send({ type: 'error', message: 'Stream error' })
        }
      } finally {
        request.log.info({ step: 'chat.request', durationMs: Date.now() - requestStart, rounds }, 'chat.request done')
        await fabric?.close()
        reply.raw.end()
      }
    }
  )
}
