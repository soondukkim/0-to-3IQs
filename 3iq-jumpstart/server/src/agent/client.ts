import OpenAI from 'openai'
import { DefaultAzureCredential, getBearerTokenProvider } from '@azure/identity'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

let client: OpenAI | null = null
let baseInstructions: string | null = null

/** Responses API client for the Azure OpenAI v1 endpoint, authenticated with Entra ID (no API key). */
export function getOpenAIClient(): OpenAI {
  if (!client) {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT
    if (!endpoint) throw new Error('AZURE_OPENAI_ENDPOINT is required')
    client = new OpenAI({
      baseURL: `${endpoint.replace(/\/+$/, '')}/`,
      apiKey: getBearerTokenProvider(
        new DefaultAzureCredential(),
        'https://cognitiveservices.azure.com/.default'
      ),
    })
  }
  return client
}

/** Agent policies (AGENTS.md); skill instructions are appended per request. */
export function getBaseInstructions(): string {
  if (baseInstructions === null) {
    try {
      baseInstructions = readFileSync(join(__dirname, '../../agents/AGENTS.md'), 'utf-8')
    } catch {
      baseInstructions = ''
    }
    baseInstructions ||= 'You are a helpful AI assistant.'
  }
  return baseInstructions
}
