export type QueryInfo = { tool: string; dax: string }

/** A Power BI item an answer was based on, with a link that opens it in Power BI. */
export type SourceInfo = {
  id: string
  name: string
  kind: 'Semantic model' | 'Report'
  url: string
  workspace?: string
}

export type SSEEvent =
  | { type: 'delta';  content: string }
  | { type: 'status'; label: string   }
  | { type: 'conversation'; id: string; title: string }
  | { type: 'query'; tool: string; dax: string }
  | { type: 'sources'; sources: SourceInfo[] }
  | { type: 'done'; responseId?: string }
  | { type: 'error';  message: string }

export type SkillInfo = { id: string; label: string }

export type ModelInfo = { id: string; label: string }

export type ModelCatalog = { default: string; models: ModelInfo[] }

export type AuthStatus = {
  /** False when Entra sign-in is not configured on the server (Fabric IQ disabled). */
  enabled: boolean
  authenticated: boolean
  user?: { name?: string; username?: string }
}

export type ConversationSummary = { id: string; title: string; updatedAt: string }

/** `enabled` is false when chat history is not configured on the server. */
export type ConversationList = { enabled: boolean; items: ConversationSummary[] }

export type StoredMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  modelLabel?: string
  queries?: QueryInfo[]
  sources?: SourceInfo[]
}

export type ConversationDetail = { id: string; title: string; messages: StoredMessage[] }
