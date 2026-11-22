import type { FastifyPluginAsync } from 'fastify'

export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get('/api/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() }
  })
}
