import type OpenAI from 'openai'

const MAX_TITLE_CHARS = 60

const TITLE_INSTRUCTIONS =
  'Write a short title (3 to 6 words) that summarises the topic of the user message. ' +
  'Use the same language as the message. Reply with the title only: no quotes, no trailing punctuation.'

const clean = (text: string) =>
  text.replace(/\s+/g, ' ').replace(/^["'`\s]+|["'`.\s]+$/g, '').slice(0, MAX_TITLE_CHARS)

/** Summarises the first user message into a conversation title; returns the fallback on any failure. */
export async function generateTitle(
  openai: OpenAI,
  model: string,
  message: string,
  fallback: string
): Promise<string> {
  try {
    const response = await openai.responses.create(
      {
        model,
        instructions: TITLE_INSTRUCTIONS,
        input: message.slice(0, 1000),
        max_output_tokens: 400,
        store: false,
      },
      { timeout: 15_000 }
    )
    return clean(response.output_text ?? '') || fallback
  } catch {
    return fallback
  }
}
