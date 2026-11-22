import { ConfidentialClientApplication, CryptoProvider, type AccountInfo } from '@azure/msal-node'

// Fabric IQ MCP requires delegated Power BI Service permissions; app-only auth is not supported.
export const FABRIC_SCOPES = [
  'https://analysis.windows.net/powerbi/api/Item.Read.All',
  'https://analysis.windows.net/powerbi/api/Item.Execute.All',
]

export class AuthRequiredError extends Error {
  constructor() {
    super('Sign-in required')
  }
}

const cryptoProvider = new CryptoProvider()
let msalApp: ConfidentialClientApplication | null = null

export function isAuthEnabled(): boolean {
  return Boolean(
    process.env.SPN_TENANT_ID && process.env.SPN_CLIENT_ID && process.env.SPN_CLIENT_SECRET
  )
}

export function getRedirectUri(): string {
  const base = (process.env.APP_BASE_URL ?? `http://localhost:${process.env.PORT ?? '8080'}`).replace(/\/+$/, '')
  return `${base}/auth/callback`
}

// A single instance is intentional: its in-memory token cache holds every signed-in user's tokens.
function getApp(): ConfidentialClientApplication {
  if (!msalApp) {
    msalApp = new ConfidentialClientApplication({
      auth: {
        clientId: process.env.SPN_CLIENT_ID!,
        clientSecret: process.env.SPN_CLIENT_SECRET!,
        authority: `https://login.microsoftonline.com/${process.env.SPN_TENANT_ID}`,
      },
    })
  }
  return msalApp
}

export async function createLoginRequest(): Promise<{ url: string; state: string; verifier: string }> {
  const { verifier, challenge } = await cryptoProvider.generatePkceCodes()
  const state = cryptoProvider.createNewGuid()
  const url = await getApp().getAuthCodeUrl({
    scopes: FABRIC_SCOPES,
    redirectUri: getRedirectUri(),
    codeChallenge: challenge,
    codeChallengeMethod: 'S256',
    state,
  })
  return { url, state, verifier }
}

export async function completeLogin(code: string, verifier: string): Promise<AccountInfo> {
  const result = await getApp().acquireTokenByCode({
    code,
    scopes: FABRIC_SCOPES,
    redirectUri: getRedirectUri(),
    codeVerifier: verifier,
  })
  if (!result.account) throw new Error('Sign-in did not return an account')
  return result.account
}

/** Returns a fresh delegated Power BI access token, refreshing silently when needed. */
export async function getFabricToken(homeAccountId: string): Promise<string> {
  const app = getApp()
  const account = await app.getTokenCache().getAccountByHomeId(homeAccountId)
  if (!account) throw new AuthRequiredError()
  try {
    const result = await app.acquireTokenSilent({ account, scopes: FABRIC_SCOPES })
    return result.accessToken
  } catch {
    throw new AuthRequiredError()
  }
}

export async function signOut(homeAccountId: string): Promise<void> {
  const app = getApp()
  const account = await app.getTokenCache().getAccountByHomeId(homeAccountId)
  if (account) await app.getTokenCache().removeAccount(account)
}
