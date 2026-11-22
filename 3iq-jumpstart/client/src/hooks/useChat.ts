import { useState, useCallback, useEffect, useRef } from 'react'
import type {
  AuthStatus, ConversationDetail, ConversationList, ConversationSummary, ModelCatalog, ModelInfo, QueryInfo, SSEEvent,
  SourceInfo,
} from '@3iq/shared'

const MODEL_STORAGE_KEY = 'model'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  isStreaming?: boolean
  modelLabel?: string
  queries?: QueryInfo[]
  sources?: SourceInfo[]
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [activityLabel, setActivityLabel] = useState<string | null>(null)
  const [models, setModels] = useState<ModelInfo[]>([])
  const [selectedModel, setSelectedModelState] = useState('')
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [historyEnabled, setHistoryEnabled] = useState(false)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | undefined>(undefined)
  // Without history, the last response id is sent back so the model keeps the conversation context.
  const lastResponseId = useRef<string | undefined>(undefined)
  const conversationId = useRef<string | undefined>(undefined)
  const abortRef = useRef<AbortController | null>(null)

  const setActive = useCallback((id: string | undefined) => {
    conversationId.current = id
    setActiveConversationId(id)
  }, [])

  const newChat = useCallback(() => {
    lastResponseId.current = undefined
    setActive(undefined)
    setMessages([])
    setActivityLabel(null)
  }, [setActive])

  const setSelectedModel = useCallback((id: string) => {
    setSelectedModelState(id)
    localStorage.setItem(MODEL_STORAGE_KEY, id)
  }, [])

  const refreshAuth = useCallback(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((data: AuthStatus) => setAuth(data))
      .catch(() => setAuth({ enabled: false, authenticated: false }))
  }, [])

  const refreshConversations = useCallback(() => {
    fetch('/api/conversations')
      .then(r => (r.ok ? r.json() : { enabled: false, items: [] }))
      .then((data: ConversationList) => {
        setHistoryEnabled(data.enabled)
        setConversations(data.items)
      })
      .catch(() => setHistoryEnabled(false))
  }, [])

  useEffect(() => {
    refreshAuth()
    // Not gated on auth: a 401 just yields an empty list, and waiting on /api/auth/me delays the sidebar.
    refreshConversations()
    fetch('/api/models')
      .then(r => r.json())
      .then((catalog: ModelCatalog) => {
        setModels(catalog.models)
        const saved = localStorage.getItem(MODEL_STORAGE_KEY)
        setSelectedModelState(catalog.models.some(m => m.id === saved) ? saved! : catalog.default)
      })
      .catch(() => setModels([]))
  }, [refreshAuth, refreshConversations])

  const logout = useCallback(async () => {
    await fetch('/auth/logout', { method: 'POST' }).catch(() => {})
    newChat()
    setConversations([])
    setHistoryEnabled(false)
    refreshAuth()
  }, [refreshAuth, newChat])

  const openConversation = useCallback(async (id: string) => {
    if (isStreaming || id === conversationId.current) return
    try {
      const response = await fetch(`/api/conversations/${id}`)
      if (!response.ok) return
      const detail = (await response.json()) as ConversationDetail
      lastResponseId.current = undefined
      setActive(detail.id)
      setActivityLabel(null)
      setMessages(detail.messages.map(m => ({
        id: m.id, role: m.role, content: m.content, modelLabel: m.modelLabel, queries: m.queries, sources: m.sources,
      })))
    } catch {
      // keep the current conversation if the load fails
    }
  }, [isStreaming, setActive])

  const deleteConversation = useCallback(async (id: string) => {
    const response = await fetch(`/api/conversations/${id}`, { method: 'DELETE' }).catch(() => null)
    if (!response?.ok) return
    if (id === conversationId.current) newChat()
    setConversations(prev => prev.filter(c => c.id !== id))
  }, [newChat])

  const sendMessage = useCallback(async (text: string) => {
    if (isStreaming) return

    const assistantId = `assistant-${Date.now()}`

    setMessages(prev => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', content: text },
      { id: assistantId, role: 'assistant', content: '', isStreaming: true, modelLabel: models.find(m => m.id === selectedModel)?.label },
    ])
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    const finalize = (error?: string) => {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: error ?? m.content, isStreaming: false }
            : m
        )
      )
      setActivityLabel(null)
      setIsStreaming(false)
      if (abortRef.current === controller) abortRef.current = null
    }

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          model: selectedModel || undefined,
          conversationId: conversationId.current,
          previousResponseId: lastResponseId.current,
        }),
      })

      if (response.status === 401) {
        setAuth(a => ({ enabled: true, authenticated: false, user: a?.user }))
        finalize('Your session has expired. Please sign in again.')
        return
      }

      if (!response.ok || !response.body) {
        finalize('Request failed. Please try again.')
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6)) as SSEEvent

            if (event.type === 'delta') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, content: m.content + event.content }
                    : m
                )
              )
            } else if (event.type === 'status') {
              setActivityLabel(event.label)
            } else if (event.type === 'conversation') {
              setActive(event.id)
              setConversations(prev =>
                prev.some(c => c.id === event.id)
                  ? prev
                  : [{ id: event.id, title: event.title, updatedAt: new Date().toISOString() }, ...prev]
              )
            } else if (event.type === 'query') {
              setMessages(prev =>
                prev.map(m =>
                  m.id === assistantId
                    ? { ...m, queries: [...(m.queries ?? []), { tool: event.tool, dax: event.dax }] }
                    : m
                )
              )
            } else if (event.type === 'sources') {
              setMessages(prev =>
                prev.map(m => (m.id === assistantId ? { ...m, sources: event.sources } : m))
              )
            } else if (event.type === 'done') {
              if (event.responseId) lastResponseId.current = event.responseId
              finalize()
              if (conversationId.current) refreshConversations()
            } else if (event.type === 'error') {
              finalize(event.message || 'Something went wrong. Please try again.')
            }
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch {
      if (controller.signal.aborted) {
        // Keep any partial answer; the server cancels the run when the connection closes.
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantId
              ? { ...m, content: m.content ? `${m.content}\n\n*Stopped.*` : '*Stopped.*', isStreaming: false }
              : m
          )
        )
        setActivityLabel(null)
        setIsStreaming(false)
        if (abortRef.current === controller) abortRef.current = null
      } else {
        finalize('Connection error. Please try again.')
      }
    }
  }, [isStreaming, selectedModel, models, setActive, refreshConversations])

  const stopMessage = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  return {
    messages, isStreaming, activityLabel, sendMessage, stopMessage,
    models, selectedModel, setSelectedModel, auth, logout, newChat,
    historyEnabled, conversations, activeConversationId, openConversation, deleteConversation,
  }
}
