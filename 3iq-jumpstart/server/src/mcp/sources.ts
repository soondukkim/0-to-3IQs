import type { SourceInfo } from '@3iq/shared'

type Kind = SourceInfo['kind']
interface Known {
  name: string
  kind: Kind
  url?: string
  workspace?: string
  workspaceId?: string
}

// Only Power BI / Fabric links from tool results are passed on to the browser.
const SAFE_URL = /^https:\/\/([\w-]+\.)*(powerbi\.com|fabric\.microsoft\.com)\//i
const safeUrl = (u: unknown) => (typeof u === 'string' && SAFE_URL.test(u) ? u : undefined)

const asKind = (type: unknown): Kind | undefined => {
  const t = String(type ?? '')
  if (/report/i.test(t)) return 'Report'
  if (/semantic|dataset/i.test(t)) return 'Semantic model'
  return undefined
}

function unwrap(output: string): any {
  try {
    const outer = JSON.parse(output)
    return typeof outer?.result === 'string' ? JSON.parse(outer.result) : null
  } catch {
    return null
  }
}

// Discovery often happens in an earlier turn (e.g. after a workspace clarification), so items are kept per conversation.
const MAX_CONVERSATIONS = 200
const knownByConversation = new Map<string, Map<string, Known>>()

export function trackerFor(conversationId?: string): SourceTracker {
  if (!conversationId) return new SourceTracker()
  let known = knownByConversation.get(conversationId)
  if (!known) {
    known = new Map()
    if (knownByConversation.size >= MAX_CONVERSATIONS) {
      knownByConversation.delete(knownByConversation.keys().next().value!)
    }
    knownByConversation.set(conversationId, known)
  }
  return new SourceTracker(known)
}

/** Collects the Power BI items that answers were actually based on, from Fabric IQ tool results. */
export class SourceTracker {
  private used = new Set<string>()

  constructor(private known = new Map<string, Known>()) {}

  private remember(id: unknown, info: Partial<Known>) {
    if (typeof id !== 'string') return
    const key = id.toLowerCase()
    const prev = this.known.get(key)
    const kind = info.kind ?? prev?.kind
    const name = info.name ?? prev?.name
    if (!kind || !name) return
    this.known.set(key, { ...prev, ...info, kind, name })
  }

  private use(id: unknown) {
    if (typeof id === 'string' && this.known.has(id.toLowerCase())) this.used.add(id.toLowerCase())
  }

  record(tool: string, args: Record<string, unknown>, output: string): void {
    const data = unwrap(output)

    if (tool === 'DiscoverArtifacts') {
      for (const a of data?.artifacts ?? []) {
        this.remember(a.ArtifactId, {
          name: a.Name,
          kind: asKind(a.ArtifactType),
          url: safeUrl(a.DirectLink),
          workspace: a.WorkspaceName,
        })
      }
    } else if (tool === 'ResolveFabricItem') {
      this.remember(data?.fabricItemId, { workspaceId: data?.workspaceId, kind: asKind(data?.itemType) })
    } else if (tool === 'ExecuteQuery') {
      const sm = data?.semanticModel
      if (sm?.ArtifactId) {
        this.remember(sm.ArtifactId, { name: sm.Name, kind: 'Semantic model' })
        this.use(sm.ArtifactId)
      }
      this.use(args.artifactId)
    } else if (tool === 'GetSemanticModelSchema') {
      this.use(args.artifactId)
    } else if (tool === 'GetReportMetadata') {
      this.use(args.reportObjectId)
    }
  }

  list(): SourceInfo[] {
    const sources: SourceInfo[] = []
    for (const id of this.used) {
      const k = this.known.get(id)!
      const url =
        k.url ??
        (k.kind === 'Semantic model'
          ? `https://app.powerbi.com/datahub/datasets/${id}`
          : k.workspaceId
            ? `https://app.powerbi.com/groups/${k.workspaceId}/reports/${id}`
            : undefined)
      if (url) sources.push({ id, name: k.name, kind: k.kind, url, workspace: k.workspace })
    }
    return sources
  }
}
