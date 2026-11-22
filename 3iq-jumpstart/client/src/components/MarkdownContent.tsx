import { useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function CodeBlock({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const className = (children as { props?: { className?: string } })?.props?.className ?? ''
  const lang = /language-([\w-]+)/.exec(className)?.[1]

  const copy = async () => {
    await navigator.clipboard.writeText(ref.current?.innerText ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="my-4 overflow-hidden rounded-xl border border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-700 px-3 py-1.5 text-xs text-slate-500 dark:text-zinc-400">
        <span>{lang ?? 'code'}</span>
        <button type="button" onClick={copy} className="hover:text-slate-800 dark:hover:text-zinc-100 transition-colors">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        ref={ref}
        className="overflow-x-auto p-3 text-[13px] leading-6 font-mono text-slate-800 dark:text-zinc-200 [&_code]:!bg-transparent [&_code]:!p-0 [&_code]:!rounded-none [&_code]:text-[13px]"
      >
        {children}
      </pre>
    </div>
  )
}

export function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-xl font-semibold mt-6 mb-2 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-semibold mt-5 mb-2 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-semibold mt-4 mb-1.5 first:mt-0">{children}</h3>,
        p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-6 my-3 space-y-1.5 marker:text-slate-400 dark:marker:text-zinc-500">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-6 my-3 space-y-1.5 marker:text-slate-400 dark:marker:text-zinc-500">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        a: ({ children, href }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-600 dark:text-sky-400 underline underline-offset-2 decoration-sky-300 dark:decoration-sky-700 hover:decoration-current"
          >
            {children}
          </a>
        ),
        code: ({ className, children }) => (
          <code className={`${className ?? ''} bg-slate-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded-md text-[13px] font-mono`}>
            {children}
          </code>
        ),
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        hr: () => <hr className="border-slate-200 dark:border-zinc-700 my-5" />,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-slate-300 dark:border-zinc-600 pl-4 my-4 text-slate-600 dark:text-zinc-400">
            {children}
          </blockquote>
        ),
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto rounded-xl border border-slate-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
            <table className="w-full border-collapse text-sm tabular-nums">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-slate-50 dark:bg-zinc-800/60">{children}</thead>,
        tr: ({ children }) => (
          <tr className="hover:bg-slate-50/70 dark:hover:bg-zinc-800/40 [tbody>&:last-child>td]:border-b-0">{children}</tr>
        ),
        th: ({ children, style }) => (
          <th
            style={style}
            className="whitespace-nowrap border-b border-slate-200 dark:border-zinc-700 px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-zinc-300"
          >
            {children}
          </th>
        ),
        td: ({ children, style }) => (
          <td style={style} className="border-b border-slate-100 dark:border-zinc-800 px-4 py-2.5 align-top">
            {children}
          </td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
