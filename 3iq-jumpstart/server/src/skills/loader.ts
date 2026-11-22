import { readFileSync, readdirSync } from 'fs'
import { join, dirname, basename } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Skills directory is two levels up from src/skills/ → server/skills/
const SKILLS_DIR = join(__dirname, '../../skills')

export interface SkillMeta {
  label: string
  /** MCP client names this skill is permitted to use. Empty array = unrestricted. */
  allowedClients: string[]
  body: string
}

export interface SkillInfo {
  id: string
  label: string
}

/**
 * Parse YAML frontmatter from a markdown file.
 * Supports simple string scalars and YAML list syntax (- item per line).
 * Tool names in `tools` must match MCP client names (e.g. 'fabric-mcp').
 */
function parseFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: content.trim() }

  const rawYaml = match[1]
  const body = match[2].trim()
  const meta: Record<string, unknown> = {}

  let currentKey: string | null = null
  let currentList: string[] | null = null

  for (const line of rawYaml.split('\n')) {
    const listItem = line.match(/^\s+-\s+(.+)/)
    if (listItem && currentKey && currentList) {
      currentList.push(listItem[1].trim())
      continue
    }
    // Flush any accumulated list before moving to next key
    if (currentList !== null && currentKey !== null) {
      meta[currentKey] = currentList
      currentList = null
      currentKey = null
    }
    const keyValue = line.match(/^(\w+)\s*:\s*(.*)$/)
    if (keyValue) {
      const key = keyValue[1]
      const value = keyValue[2].trim()
      if (value === '') {
        // Subsequent lines may be a list
        currentKey = key
        currentList = []
      } else {
        meta[key] = value
      }
    }
  }
  // Flush trailing list
  if (currentList !== null && currentKey !== null) meta[currentKey] = currentList

  return { meta, body }
}

/**
 * Load and parse a skill file by id.
 * Falls back to 'default' if the requested skill file is not found.
 * The id is sanitised to prevent path traversal.
 */
export function loadSkill(id: string): SkillMeta {
  const safeId = id.replace(/[^a-zA-Z0-9-_]/g, '')
  let raw: string
  try {
    raw = readFileSync(join(SKILLS_DIR, `${safeId}.md`), 'utf-8')
  } catch {
    raw = readFileSync(join(SKILLS_DIR, 'default.md'), 'utf-8')
  }
  const { meta, body } = parseFrontmatter(raw)
  const tools = Array.isArray(meta['tools']) ? (meta['tools'] as string[]) : []
  return {
    label: typeof meta['label'] === 'string' ? meta['label'] : safeId,
    allowedClients: tools,
    body,
  }
}

/**
 * List all available skills from the skills directory.
 * 'default' is always sorted first.
 */
export function listSkills(): SkillInfo[] {
  try {
    return readdirSync(SKILLS_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const id = basename(f, '.md')
        const { meta } = parseFrontmatter(readFileSync(join(SKILLS_DIR, f), 'utf-8'))
        return {
          id,
          label: typeof meta['label'] === 'string' ? meta['label'] : id,
        }
      })
      .sort((a, b) => {
        if (a.id === 'default') return -1
        if (b.id === 'default') return 1
        return a.label.localeCompare(b.label)
      })
  } catch {
    return [{ id: 'default', label: 'Default' }]
  }
}
