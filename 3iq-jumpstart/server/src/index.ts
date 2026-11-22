// Must be first: loads .env, then starts telemetry before fastify/http are imported
import './instrument.js'

import Fastify from 'fastify'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { randomBytes } from 'crypto'
import fastifyCors from '@fastify/cors'
import fastifyCookie from '@fastify/cookie'
import fastifySession from '@fastify/session'
import fastifyStatic from '@fastify/static'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'
import { serializerCompiler, validatorCompiler, jsonSchemaTransform } from 'fastify-type-provider-zod'

import { isAuthEnabled } from './auth/entra.js'
import { authRoute } from './routes/auth.js'
import { chatRoute } from './routes/chat.js'
import { conversationsRoute } from './routes/conversations.js'
import { healthRoute } from './routes/health.js'
import { modelsRoute } from './routes/models.js'
import { skillsRoute } from './routes/skills.js'
import { isHistoryEnabled, warmUpHistory } from './store/cosmos.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function start() {
  const authEnabled = isAuthEnabled()
  if (!authEnabled) {
    console.warn('SPN_* not set — sign-in and Fabric IQ are disabled')
  }

  if (!process.env.AZURE_OPENAI_ENDPOINT) {
    throw new Error('AZURE_OPENAI_ENDPOINT is required')
  }

  // Boot Fastify (trustProxy so secure cookies work behind the hosting TLS proxy)
  const app = Fastify({ logger: true, trustProxy: true })

  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)

  await app.register(fastifyCors, { origin: true })
  await app.register(fastifyCookie)
  // Sessions and tokens live in memory, so a per-process key loses nothing a restart doesn't already lose.
  // Single instance only; use a shared store (e.g. Redis) and a shared key to scale out.
  await app.register(fastifySession, {
    secret: randomBytes(32).toString('hex'),
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 8 * 60 * 60 * 1000,
    },
  })

  await app.register(fastifySwagger, {
    openapi: {
      info: { title: '3IQ Jumpstart API', version: '1.0.0' },
    },
    transform: jsonSchemaTransform,
  })
  await app.register(fastifySwaggerUi, { routePrefix: '/docs' })

  await app.register(authRoute)
  await app.register(chatRoute)
  await app.register(conversationsRoute)
  await app.register(healthRoute)
  await app.register(modelsRoute)
  await app.register(skillsRoute)

  // Serve React SPA in production (Fastify serves client/dist/)
  if (process.env.NODE_ENV === 'production') {
    await app.register(fastifyStatic, {
      root: join(__dirname, '../../client/dist'),
      prefix: '/',
    })
    app.setNotFoundHandler((_, reply) => {
      reply.sendFile('index.html')
    })
  }

  const port = parseInt(process.env.PORT ?? '8080')
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`Server ready on http://localhost:${port}`)
  console.log(`API docs at  http://localhost:${port}/docs`)
  if (isHistoryEnabled()) void warmUpHistory()

  const shutdown = async () => {
    await app.close()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

start().catch(err => {
  console.error('Failed to start:', err)
  process.exit(1)
})
