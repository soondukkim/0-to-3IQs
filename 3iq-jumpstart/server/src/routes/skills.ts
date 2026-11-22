import type { FastifyPluginAsync } from 'fastify'
import { listSkills } from '../skills/loader.js'

export const skillsRoute: FastifyPluginAsync = async (app) => {
  app.get('/api/skills', async () => {
    return listSkills()
  })
}
