import { CosmosClient, type Container } from '@azure/cosmos'
import { DefaultAzureCredential } from '@azure/identity'
import { randomUUID } from 'crypto'
import type { ConversationSummary, QueryInfo, SourceInfo, StoredMessage } from '@3iq/shared'

export interface ConversationDoc {
  id: string
  userId: string
  title: string
  lastResponseId?: string
  model?: string
  createdAt: string
  updatedAt: string
}

interface MessageDoc extends StoredMessage {
  id: string
  conversationId: string
  userId: string
  createdAt: string
}

export interface ToolLogDoc {
  userId: string
  username?: string
  conversationId?: string
  model: string
  tool: string
  dax?: string
  arguments: string
  ok: boolean
  durationMs: number
}

/** History needs a Cosmos account; user-scoped data also needs sign-in, so auth must be on too. */
export function isHistoryEnabled(): boolean {
  return Boolean(process.env.COSMOS_ENDPOINT)
}

let containers: { conversations: Container; messages: Container; daxlog: Container } | null = null

function db() {
  if (!containers) {
    const client = new CosmosClient({
      endpoint: process.env.COSMOS_ENDPOINT!,
      aadCredentials: new DefaultAzureCredential(),
    })
    const database = client.database(process.env.COSMOS_DATABASE || 'threeiq')
    containers = {
      conversations: database.container('conversations'),
      messages: database.container('messages'),
      daxlog: database.container('daxlog'),
    }
  }
  return containers
}

/** Opens the connection and fetches an AAD token ahead of the first user request. */
export async function warmUpHistory(): Promise<void> {
  await db().conversations.item(randomUUID(), 'warmup').read().catch(() => {})
}

export async function getConversation(userId: string, id: string): Promise<ConversationDoc | null> {
  const { resource } = await db().conversations.item(id, userId).read<ConversationDoc>()
  return resource ?? null
}

export async function createConversation(userId: string, title: string, model: string): Promise<ConversationDoc> {
  const now = new Date().toISOString()
  const doc: ConversationDoc = { id: randomUUID(), userId, title, model, createdAt: now, updatedAt: now }
  await db().conversations.items.create(doc)
  return doc
}

export async function saveConversation(doc: ConversationDoc): Promise<void> {
  await db().conversations.items.upsert({ ...doc, updatedAt: new Date().toISOString() })
}

export async function listConversations(userId: string): Promise<ConversationSummary[]> {
  const { resources } = await db()
    .conversations.items.query<ConversationSummary>(
      {
        query: 'SELECT TOP 50 c.id, c.title, c.updatedAt FROM c WHERE c.userId = @u ORDER BY c.updatedAt DESC',
        parameters: [{ name: '@u', value: userId }],
      },
      { partitionKey: userId }
    )
    .fetchAll()
  return resources
}

export async function addMessage(
  userId: string,
  conversationId: string,
  msg: {
    role: 'user' | 'assistant'
    content: string
    modelLabel?: string
    queries?: QueryInfo[]
    sources?: SourceInfo[]
  }
): Promise<void> {
  const doc: MessageDoc = {
    id: randomUUID(),
    conversationId,
    userId,
    createdAt: new Date().toISOString(),
    ...msg,
  }
  await db().messages.items.create(doc)
}

export async function listMessages(userId: string, conversationId: string): Promise<StoredMessage[]> {
  const { resources } = await db()
    .messages.items.query<StoredMessage>(
      {
        query:
          'SELECT c.id, c.role, c.content, c.modelLabel, c.queries, c.sources FROM c WHERE c.conversationId = @c AND c.userId = @u ORDER BY c.createdAt ASC',
        parameters: [
          { name: '@c', value: conversationId },
          { name: '@u', value: userId },
        ],
      },
      { partitionKey: conversationId }
    )
    .fetchAll()
  return resources
}

/** Removes the conversation and its messages. The DAX audit log is kept until its own expiry. */
export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const { resources } = await db()
    .messages.items.query<{ id: string }>(
      {
        query: 'SELECT c.id FROM c WHERE c.conversationId = @c AND c.userId = @u',
        parameters: [
          { name: '@c', value: conversationId },
          { name: '@u', value: userId },
        ],
      },
      { partitionKey: conversationId }
    )
    .fetchAll()
  await Promise.all(resources.map(m => db().messages.item(m.id, conversationId).delete()))
  await db().conversations.item(conversationId, userId).delete()
}

export async function logToolCall(entry: ToolLogDoc): Promise<void> {
  await db().daxlog.items.create({ id: randomUUID(), createdAt: new Date().toISOString(), ...entry })
}
