import type { FastifyPluginAsync } from 'fastify'
import { timingSafeEqual } from 'crypto'
import type { AuthStatus } from '@3iq/shared'
import { completeLogin, createLoginRequest, isAuthEnabled, signOut } from '../auth/entra.js'

declare module 'fastify' {
  interface Session {
    oauthState?: string
    pkceVerifier?: string
    homeAccountId?: string
    name?: string
    username?: string
  }
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export const authRoute: FastifyPluginAsync = async (app) => {
  app.get('/api/auth/me', async (request): Promise<AuthStatus> => {
    if (!isAuthEnabled()) return { enabled: false, authenticated: false }
    const s = request.session
    if (!s.homeAccountId) return { enabled: true, authenticated: false }
    return { enabled: true, authenticated: true, user: { name: s.name, username: s.username } }
  })

  app.get('/auth/login', async (request, reply) => {
    if (!isAuthEnabled()) return reply.code(404).send({ error: 'Sign-in is not configured' })
    const { url, state, verifier } = await createLoginRequest()
    request.session.oauthState = state
    request.session.pkceVerifier = verifier
    return reply.redirect(url)
  })

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/callback',
    async (request, reply) => {
      const { code, state, error } = request.query
      const s = request.session
      const expectedState = s.oauthState
      const verifier = s.pkceVerifier
      s.oauthState = undefined
      s.pkceVerifier = undefined

      if (error || !code || !state || !expectedState || !verifier || !safeEqual(state, expectedState)) {
        request.log.warn({ error }, 'Sign-in callback rejected')
        return reply.redirect('/?auth=failed')
      }

      try {
        const account = await completeLogin(code, verifier)
        // Regenerate to prevent session fixation.
        await request.session.regenerate()
        request.session.homeAccountId = account.homeAccountId
        request.session.name = account.name
        request.session.username = account.username
        return reply.redirect('/')
      } catch (err) {
        request.log.error(err, 'Sign-in failed')
        return reply.redirect('/?auth=failed')
      }
    }
  )

  app.post('/auth/logout', async (request) => {
    const id = request.session.homeAccountId
    if (id) await signOut(id).catch(() => {})
    await request.session.destroy()
    return { ok: true }
  })
}
