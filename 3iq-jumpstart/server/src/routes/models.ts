import type { FastifyPluginAsync } from 'fastify'
import { getModelCatalog } from '../agent/models.js'

export const modelsRoute: FastifyPluginAsync = async (app) => {
  app.get('/api/models', async () => getModelCatalog())
}
