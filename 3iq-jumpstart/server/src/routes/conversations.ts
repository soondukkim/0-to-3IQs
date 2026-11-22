import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { ConversationDetail, ConversationList } from '@3iq/shared'
import { isAuthEnabled } from '../auth/entra.js'
import { deleteConversation, getConversation, isHistoryEnabled, listConversations, listMessages } from '../store/cosmos.js'

const ParamsSchema = z.object({ id: z.string().uuid() })

/** Returns the signed-in user's id, or null after sending the error response. */
function requireUser(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = request.session.homeAccountId
  if (!userId) {
    reply.code(401).send({ error: 'auth_required' })
    return null
  }
  return userId
}

export const conversationsRoute: FastifyPluginAsync = async (app) => {
  const enabled = () => isHistoryEnabled() && isAuthEnabled()

  app.get('/api/conversations', async (request, reply): Promise<ConversationList | void> => {
    if (!enabled()) return { enabled: false, items: [] }
    const userId = requireUser(request, reply)
    if (!userId) return
    return { enabled: true, items: await listConversations(userId) }
  })

  app.withTypeProvider<ZodTypeProvider>().get(
    '/api/conversations/:id',
    { schema: { params: ParamsSchema } },
    async (request, reply): Promise<ConversationDetail | void> => {
      if (!enabled()) return reply.code(404).send({ error: 'History is not enabled' })
      const userId = requireUser(request, reply)
      if (!userId) return
      const conversation = await getConversation(userId, request.params.id)
      if (!conversation) return reply.code(404).send({ error: 'Not found' })
      return {
        id: conversation.id,
        title: conversation.title,
        messages: await listMessages(userId, conversation.id),
      }
    }
  )

  app.withTypeProvider<ZodTypeProvider>().delete(
    '/api/conversations/:id',
    { schema: { params: ParamsSchema } },
    async (request, reply) => {
      if (!enabled()) return reply.code(404).send({ error: 'History is not enabled' })
      const userId = requireUser(request, reply)
      if (!userId) return
      if (!(await getConversation(userId, request.params.id))) return reply.code(404).send({ error: 'Not found' })
      await deleteConversation(userId, request.params.id)
      return { ok: true }
    }
  )
}
