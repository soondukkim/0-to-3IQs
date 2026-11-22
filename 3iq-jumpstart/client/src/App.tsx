import { useRef, useEffect, useState, useCallback } from 'react'
import { useChat } from './hooks/useChat'
import { MarkdownContent } from './components/MarkdownContent'
import type { ConversationSummary, ModelInfo, QueryInfo, SourceInfo } from '@3iq/shared'

function LogoIcon() {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" strokeWidth="10" strokeLinecap="round">
      <path d="M28.1 24 A34 34 0 0 1 71.9 24" stroke="#67e8f9" />
      <path d="M83.5 44.1 A34 34 0 0 1 61.6 81.9" stroke="#38bdf8" />
      <path d="M38.4 81.9 A34 34 0 0 1 16.5 44.1" stroke="#3b82f6" />
      <circle cx="50" cy="52" r="7" fill="#38bdf8" stroke="none" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeLinecap="round" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const SIDEBAR_MIN = 200
const SIDEBAR_MAX = 520
const SIDEBAR_DEFAULT = 256

const clampSidebar = (w: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w))

function useSidebarWidth() {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem('sidebarWidth'))
    return Number.isFinite(saved) && saved > 0 ? clampSidebar(saved) : SIDEBAR_DEFAULT
  })
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    localStorage.setItem('sidebarWidth', String(width))
  }, [width])

  const startDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    setDragging(true)
    const onMove = (ev: PointerEvent) => setWidth(clampSidebar(startWidth + ev.clientX - startX))
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }, [width])

  const onKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') setWidth(w => clampSidebar(w - 16))
    else if (e.key === 'ArrowRight') setWidth(w => clampSidebar(w + 16))
  }, [])

  return { width, dragging, startDrag, onKeyDown, reset: () => setWidth(SIDEBAR_DEFAULT) }
}

interface SidebarProps {
  conversations: ConversationSummary[]
  activeId: string | undefined
  disabled: boolean
  open: boolean
  onClose: () => void
  onNew: () => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}

function Sidebar({ conversations, activeId, disabled, open, onClose, onNew, onOpen, onDelete }: SidebarProps) {
  const { width, dragging, startDrag, onKeyDown, reset } = useSidebarWidth()
  return (
    <>
      {open && <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={onClose} />}
      {dragging && <div className="fixed inset-0 z-40 cursor-col-resize select-none" />}
      <aside
        style={{ '--sidebar-w': `${width}px` } as React.CSSProperties}
        className={`${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 fixed md:relative inset-y-0 left-0 z-30 w-64 md:w-[var(--sidebar-w)] shrink-0 flex flex-col border-r border-[#e8e6dc] dark:border-zinc-800 bg-[#f5f4ed] dark:bg-zinc-900 ${dragging ? '' : 'transition-transform duration-200'}`}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={startDrag}
          onKeyDown={onKeyDown}
          onDoubleClick={reset}
          title="Drag to resize, double-click to reset"
          className={`hidden md:block absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none outline-none transition-colors hover:bg-blue-500/40 focus-visible:bg-blue-500/40 ${dragging ? 'bg-blue-500/40' : ''}`}
        />
        <div className="px-4 pt-4 pb-1">
          <span className="font-serif text-2xl">3IQ Jumpstart</span>
        </div>
        <div className="p-3">
          <button
            onClick={() => { onNew(); onClose() }}
            disabled={disabled}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-base font-medium text-slate-800 dark:text-zinc-100 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 transition-colors disabled:opacity-50"
          >
            <PlusIcon />
            New chat
          </button>
        </div>
        <div className="px-4 pb-1 text-sm font-medium text-slate-400 dark:text-zinc-500">Recents</div>
        <nav className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {conversations.length === 0 ? (
            <p className="px-2 py-2 text-base text-slate-400 dark:text-zinc-500">No conversations yet</p>
          ) : conversations.map(c => (
            <div key={c.id} className="group relative">
              <button
                onClick={() => { onOpen(c.id); onClose() }}
                disabled={disabled}
                title={c.title}
                className={`w-full truncate text-left rounded-lg px-3 py-2.5 pr-9 text-base transition-colors disabled:opacity-60 ${
                  c.id === activeId
                    ? 'bg-black/5 dark:bg-white/10 text-slate-900 dark:text-zinc-100'
                    : 'text-slate-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-zinc-800'
                }`}
              >
                {c.title}
              </button>
              <button
                aria-label="Delete conversation"
                disabled={disabled}
                onClick={() => { if (window.confirm('Delete this conversation?')) onDelete(c.id) }}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-zinc-700 transition disabled:hidden"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </nav>
      </aside>
    </>
  )
}

function ExternalLinkIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function SourceIcon({ kind }: { kind: SourceInfo['kind'] }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        {kind === 'Report' ? (
          <path d="M5 20V10M12 20V4M19 20v-7" strokeLinecap="round" />
        ) : (
          <path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </span>
  )
}

function SourcesRow({ sources }: { sources: SourceInfo[] }) {
  const safe = sources.filter(s => /^https:\/\//i.test(s.url))
  if (safe.length === 0) return null
  return (
    <div className="mt-4">
      <div className="mb-2 text-xs font-medium text-slate-400 dark:text-zinc-500">Sources</div>
      <div className="flex flex-wrap gap-2">
        {safe.map(s => (
          <a
            key={s.id}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${s.name} in Power BI`}
            className="group inline-flex min-w-0 max-w-full items-center gap-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 py-2 pl-2 pr-3 transition-colors hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/60 dark:hover:bg-blue-950/30"
          >
            <SourceIcon kind={s.kind} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-slate-800 dark:text-zinc-100">{s.name}</span>
              <span className="block truncate text-xs text-slate-500 dark:text-zinc-400">
                {s.kind}{s.workspace ? ` \u00b7 ${s.workspace}` : ''}
              </span>
            </span>
            <span className="shrink-0 text-slate-400 dark:text-zinc-500 group-hover:text-blue-600 dark:group-hover:text-blue-400">
              <ExternalLinkIcon />
            </span>
          </a>
        ))}
      </div>
    </div>
  )
}

function QueriesPanel({ queries }: { queries: QueryInfo[] }) {
  return (
    <details className="group mt-3 rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
      <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 px-3 py-2 text-xs text-slate-500 dark:text-zinc-400 hover:text-slate-800 dark:hover:text-zinc-100">
        <span className="transition-transform -rotate-90 group-open:rotate-0"><ChevronIcon /></span>
        Queries run ({queries.length})
      </summary>
      <div className="px-3 pb-1">
        {queries.map((q, i) => (
          <MarkdownContent key={i} content={`\`\`\`\`dax\n${q.dax}\n\`\`\`\``} />
        ))}
      </div>
    </details>
  )
}

interface InputBoxProps {
  input: string
  setInput: (v: string) => void
  isStreaming: boolean
  onSubmit: (e: React.FormEvent) => void
  onStop: () => void
  models: ModelInfo[]
  selectedModel: string
  setSelectedModel: (id: string) => void
  dropUp: boolean
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface ModelPickerProps {
  models: ModelInfo[]
  selectedModel: string
  setSelectedModel: (id: string) => void
  disabled: boolean
  dropUp: boolean
}

function ModelPicker({ models, selectedModel, setSelectedModel, disabled, dropUp }: ModelPickerProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (models.length === 0) return null
  const current = models.find(m => m.id === selectedModel) ?? models[0]
  if (models.length === 1) {
    return <span className="px-2.5 py-1.5 text-sm text-slate-500 dark:text-zinc-400">{current.label}</span>
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Select model"
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${open ? 'bg-black/5 dark:bg-white/10' : ''}`}
      >
        {current.label}
        <ChevronIcon />
      </button>
      {open && (
        <div
          role="listbox"
          className={`absolute right-0 z-30 w-64 rounded-2xl border border-[#e3e0d5] dark:border-zinc-700 bg-white dark:bg-zinc-900 p-1.5 shadow-lg ${dropUp ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          {models.map(m => (
            <button
              key={m.id}
              type="button"
              role="option"
              aria-selected={m.id === current.id}
              onClick={() => { setSelectedModel(m.id); setOpen(false) }}
              className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-800 dark:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <span className="truncate">{m.label}</span>
              {m.id === current.id && <span className="shrink-0 text-blue-600 dark:text-blue-400"><CheckIcon /></span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function InputBox({ input, setInput, isStreaming, onSubmit, onStop, models, selectedModel, setSelectedModel, dropUp }: InputBoxProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Grow the textarea with its content, up to a cap
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter adds a new line
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (input.trim() && !isStreaming) e.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <div>
    <form onSubmit={onSubmit}>
      <div className="px-4 pt-3.5 pb-2.5 bg-white dark:bg-zinc-900 border border-[#e3e0d5] dark:border-zinc-700 rounded-2xl shadow-sm hover:shadow-md focus-within:shadow-md focus-within:border-slate-300 dark:focus-within:border-zinc-600 transition-all">
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
          placeholder="How can I help you today?"
          className="block w-full resize-none bg-transparent text-[15px] leading-6 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-zinc-500 outline-none disabled:opacity-50"
        />

        <div className="mt-2 flex items-center justify-end gap-2">
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop"
              title="Stop"
              className="shrink-0 w-8 h-8 bg-slate-800 hover:bg-slate-700 dark:bg-zinc-200 dark:hover:bg-zinc-300 text-white dark:text-zinc-900 rounded-xl flex items-center justify-center transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send"
              className="shrink-0 w-8 h-8 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 dark:disabled:bg-zinc-800 text-white disabled:text-slate-300 dark:disabled:text-zinc-600 rounded-xl flex items-center justify-center transition-colors disabled:cursor-not-allowed"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </form>
    <div className="mt-1.5 flex justify-end px-1">
      <ModelPicker
        models={models} selectedModel={selectedModel} setSelectedModel={setSelectedModel}
        disabled={isStreaming} dropUp={dropUp}
      />
    </div>
    </div>
  )
}

export default function App() {
  const {
    messages, isStreaming, activityLabel, sendMessage, stopMessage,
    models, selectedModel, setSelectedModel, auth, logout, newChat,
    historyEnabled, conversations, activeConversationId, openConversation, deleteConversation,
  } = useChat()
  const needsSignIn = auth?.enabled === true && !auth.authenticated
  const firstName = auth?.user?.name?.split(' ')[0]
  const greeting = `Happy ${new Date().toLocaleDateString('en-US', { weekday: 'long' })}${firstName ? `, ${firstName}` : ''}`
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [input, setInput] = useState('')
  const [dark, setDark] = useState(() => {
    if (typeof window === 'undefined') return false
    return (
      localStorage.getItem('theme') === 'dark' ||
      (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    )
  })
  const bottomRef = useRef<HTMLDivElement>(null)
  const hasMessages = messages.length > 0

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, activityLabel])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    sendMessage(trimmed)
    setInput('')
  }

  const inputBox = (
    <InputBox
      input={input} setInput={setInput} isStreaming={isStreaming} onSubmit={handleSubmit} onStop={stopMessage}
      models={models} selectedModel={selectedModel} setSelectedModel={setSelectedModel} dropUp={hasMessages}
    />
  )

  return (
    <div className="flex h-screen bg-[#faf9f5] dark:bg-zinc-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">

      {historyEnabled && !needsSignIn && (
        <Sidebar
          conversations={conversations}
          activeId={activeConversationId}
          disabled={isStreaming}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onNew={newChat}
          onOpen={openConversation}
          onDelete={deleteConversation}
        />
      )}

      <div className="flex flex-col flex-1 min-w-0">

      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3">
        <div className="flex items-center gap-2.5">
          {historyEnabled && !needsSignIn && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden p-1.5 -ml-1.5 rounded-lg text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
              aria-label="Open conversations"
            >
              <MenuIcon />
            </button>
          )}
          {(hasMessages || needsSignIn) && (
            <div className="w-7 h-7">
              <LogoIcon />
            </div>
          )}
          <span className={`font-serif text-xl ${historyEnabled && !needsSignIn ? 'md:hidden' : ''}`}>3IQ Jumpstart</span>
        </div>
        <div className="flex items-center gap-1">
          {hasMessages && !historyEnabled && (
            <button
              onClick={newChat}
              disabled={isStreaming}
              className="text-xs px-2.5 py-1.5 rounded-lg text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              New chat
            </button>
          )}
          {auth?.authenticated && (
            <button
              onClick={logout}
              disabled={isStreaming}
              title={auth.user?.username}
              className="text-xs px-2.5 py-1.5 rounded-lg text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              Sign out{auth.user?.name ? ` (${auth.user.name})` : ''}
            </button>
          )}
          <button
            onClick={() => setDark(d => !d)}
            className="p-2 rounded-lg text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
            aria-label="Toggle dark mode"
          >
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </header>

      {needsSignIn ? (
        /* Sign-in gate: Fabric IQ runs under the signed-in user's permissions */
        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 pb-16">
          <div className="w-full max-w-md text-center space-y-4">
            <h1 className="text-2xl font-semibold tracking-tight">Sign in to continue</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400">
              Answers come from the Power BI reports and semantic models you have access to in Microsoft Fabric.
            </p>
            {new URLSearchParams(window.location.search).get('auth') === 'failed' && (
              <p className="text-sm text-red-600 dark:text-red-400">Sign-in failed. Please try again.</p>
            )}
            <a
              href="/auth/login"
              className="inline-block px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              Sign in with Microsoft
            </a>
          </div>
        </div>
      ) : hasMessages ? (
        /* Chat view */
        <>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-8 pb-4">
            <div className="max-w-3xl mx-auto space-y-8">

              {messages.map(message => (
                message.role === 'user' ? (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-[15px] leading-6 bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-sm whitespace-pre-wrap break-words">
                      {message.content}
                    </div>
                  </div>
                ) : (
                  <div key={message.id} className="text-[15px] leading-7 text-slate-800 dark:text-slate-100 break-words">
                    {message.content ? (
                      <MarkdownContent content={message.content} />
                    ) : message.isStreaming ? (
                      <span className="flex items-center gap-1 py-1.5">
                        {[0, 150, 300].map(delay => (
                          <span
                            key={delay}
                            className="w-1.5 h-1.5 bg-slate-300 dark:bg-zinc-500 rounded-full animate-bounce"
                            style={{ animationDelay: `${delay}ms` }}
                          />
                        ))}
                      </span>
                    ) : null}
                    {message.sources && message.sources.length > 0 && <SourcesRow sources={message.sources} />}
                    {message.queries && message.queries.length > 0 && <QueriesPanel queries={message.queries} />}
                    {!message.isStreaming && message.content && message.modelLabel && (
                      <div className="mt-3 text-xs text-slate-400 dark:text-zinc-500">{message.modelLabel}</div>
                    )}
                  </div>
                )
              ))}

              {activityLabel && (
                <div className="flex justify-start">
                  <span className="inline-flex items-center gap-1.5 text-xs text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 border border-blue-100 dark:border-blue-900 px-3 py-1.5 rounded-full">
                    <svg className="w-3 h-3 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {activityLabel}
                  </span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          <div className="shrink-0 px-4 sm:px-6 pb-4 pt-2">
            <div className="max-w-3xl mx-auto">
              {inputBox}
              <p className="mt-2 text-center text-xs text-slate-400 dark:text-zinc-500">
                AI can make mistakes. Check important results against the source report.
              </p>
            </div>
          </div>
        </>
      ) : (
        /* Hero view */
        <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 pb-16">
          <div className="w-full max-w-2xl space-y-6">

            <div className="flex items-center justify-center gap-3">
              <div className="w-10 h-10 shrink-0">
                <LogoIcon />
              </div>
              <h1 className="font-serif text-3xl sm:text-4xl tracking-tight">{greeting}</h1>
            </div>

            {inputBox}

          </div>
        </div>
      )}

      </div>
    </div>
  )
}
