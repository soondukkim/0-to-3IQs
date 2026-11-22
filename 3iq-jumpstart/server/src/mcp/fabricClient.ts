import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { FunctionTool } from 'openai/resources/responses/responses'

const DEFAULT_ENDPOINT = 'https://fabriciq.svc.cloud.microsoft/v1/mcp/fabriciq'
const DEFAULT_VARIANT = 'Fabric.Routing.FabricIQ.V1'
const MAX_RESULT_CHARS = 60_000
const MAX_ATTEMPTS = 3

export interface FabricSession {
  tools: FunctionTool[]
  /** Returns a JSON string suitable for submitting as a tool output. */
  callTool(name: string, args: Record<string, unknown>): Promise<string>
  close(): Promise<void>
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function isRetryable(err: unknown): boolean {
  const e = err as { code?: number; message?: string }
  return e?.code === 429 || /\b429\b|rate.?limit|throttl/i.test(e?.message ?? '')
}

function formatResult(result: Awaited<ReturnType<Client['callTool']>>): string {
  const blocks = (Array.isArray(result.content) ? result.content : []) as Array<{
    type: string
    text?: string
    resource?: { text?: string; uri?: string }
  }>
  let text = blocks
    .map(c => {
      if (c.type === 'text') return c.text ?? ''
      if (c.type === 'resource') return c.resource?.text ?? `[binary resource ${c.resource?.uri ?? ''} omitted]`
      return `[${c.type} content omitted]`
    })
    .join('\n')
  if (!text && result.structuredContent) text = JSON.stringify(result.structuredContent)
  if (text.length > MAX_RESULT_CHARS) {
    text = `${text.slice(0, MAX_RESULT_CHARS)}\n[truncated - use aggregation or filters to reduce the result size]`
  }
  return JSON.stringify(result.isError ? { error: text } : { result: text })
}

/**
 * Opens a Fabric IQ MCP connection that runs as the signed-in user.
 * The token callback is invoked per HTTP request so long runs survive token expiry.
 */
export async function openFabricSession(getToken: () => Promise<string>): Promise<FabricSession> {
  const endpoint = process.env.FABRIC_MCP_ENDPOINT || DEFAULT_ENDPOINT
  const variant = process.env.FABRIC_MCP_VARIANT || DEFAULT_VARIANT

  const authedFetch: FetchLike = async (url, init) => {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${await getToken()}`)
    if (variant) headers.set('X-Variants', variant)
    return fetch(url, { ...init, headers })
  }

  const transport = new StreamableHTTPClientTransport(new URL(endpoint), { fetch: authedFetch })
  const client = new Client({ name: '3iq-server', version: '1.0.0' })
  await client.connect(transport)

  const tools: FunctionTool[] = []
  let cursor: string | undefined
  do {
    const page = await client.listTools({ cursor })
    for (const t of page.tools) {
      tools.push({
        type: 'function',
        name: t.name,
        description: t.description ?? '',
        parameters: t.inputSchema,
        strict: false,
      })
    }
    cursor = page.nextCursor
  } while (cursor)

  return {
    tools,
    async callTool(name, args) {
      for (let attempt = 1; ; attempt++) {
        try {
          return formatResult(await client.callTool({ name, arguments: args }))
        } catch (err) {
          if (attempt >= MAX_ATTEMPTS || !isRetryable(err)) throw err
          await sleep(1000 * 2 ** (attempt - 1))
        }
      }
    },
    async close() {
      await transport.terminateSession().catch(() => {})
      await client.close().catch(() => {})
    },
  }
}
