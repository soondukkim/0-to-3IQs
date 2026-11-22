const GRAPH = 'https://graph.microsoft.com/v1.0'

export class GraphError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message)
  }
}

async function graph<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    throw new GraphError(res.status, body?.error?.code ?? 'unknown', body?.error?.message ?? res.statusText)
  }
  return (await res.json()) as T
}

// Graph's OData parser is safest with %20 rather than the "+" that URLSearchParams uses for spaces.
const qs = (params: Record<string, string>) => new URLSearchParams(params).toString().replace(/\+/g, '%20')

interface Message {
  subject?: string
  from?: { emailAddress?: { name?: string; address?: string } }
  receivedDateTime?: string
  bodyPreview?: string
  webLink?: string
}

export interface EmailHit {
  subject: string
  from: string
  receivedAt: string
  preview: string
  link?: string
}

/** Mail.Read: phrase search across the signed-in user's mailbox, newest first. */
export async function searchEmails(token: string, query: string, top: number): Promise<EmailHit[]> {
  // $search takes a KQL string in double quotes (phrase match); strip quotes so the query cannot break out.
  const phrase = query.replace(/"/g, ' ').trim()
  const params = qs({
    $search: `"${phrase}"`,
    $top: String(top),
    $select: 'subject,from,receivedDateTime,bodyPreview,webLink',
  })
  const data = await graph<{ value: Message[] }>(token, `/me/messages?${params}`)
  return data.value
    .map(m => ({
      subject: m.subject ?? '(no subject)',
      from: m.from?.emailAddress
        ? `${m.from.emailAddress.name ?? ''} <${m.from.emailAddress.address ?? ''}>`.trim()
        : 'unknown',
      receivedAt: m.receivedDateTime ?? '',
      preview: m.bodyPreview ?? '',
      link: m.webLink,
    }))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
}

export interface Person {
  id: string
  displayName: string
  mail: string | null
  userPrincipalName: string
}

// User.ReadBasic.All only returns these basic properties.
const SELECT_PERSON = 'id,displayName,mail,userPrincipalName'

/** User.ReadBasic.All: find colleagues by the start of their name or email. */
export async function findPeople(token: string, name: string): Promise<Person[]> {
  const v = name.replace(/'/g, "''")
  const params = qs({
    $filter: `startswith(displayName,'${v}') or startswith(givenName,'${v}') or startswith(surname,'${v}') or startswith(mail,'${v}')`,
    $top: '5',
    $select: SELECT_PERSON,
  })
  return (await graph<{ value: Person[] }>(token, `/users?${params}`)).value
}

export function getUser(token: string, emailOrId: string): Promise<Person> {
  return graph<Person>(token, `/users/${encodeURIComponent(emailOrId)}?$select=${SELECT_PERSON}`)
}

export function getMe(token: string): Promise<Person> {
  return graph<Person>(token, `/me?$select=${SELECT_PERSON}`)
}

/** Chat.Create + ChatMessage.Send: post into the 1:1 chat with a colleague (Graph returns the existing chat if there is one). */
export async function sendDirectMessage(
  token: string,
  meId: string,
  userId: string,
  text: string
): Promise<{ chatId: string; messageId: string; webUrl?: string }> {
  const member = (id: string) => ({
    '@odata.type': '#microsoft.graph.aadUserConversationMember',
    roles: ['owner'],
    'user@odata.bind': `${GRAPH}/users('${id}')`,
  })
  const chat = await graph<{ id: string }>(token, '/chats', {
    method: 'POST',
    body: JSON.stringify({ chatType: 'oneOnOne', members: [member(meId), member(userId)] }),
  })
  const msg = await graph<{ id: string; webUrl?: string }>(token, `/chats/${encodeURIComponent(chat.id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body: { contentType: 'text', content: text } }),
  })
  return { chatId: chat.id, messageId: msg.id, webUrl: msg.webUrl }
}
