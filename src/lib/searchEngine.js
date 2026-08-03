import { classifyAttachment } from './whatsappParser.js'

const QUERY_ALIASES = new Map([
  ['hm', ['headmistress', 'headmaster']],
  ['pdfs', ['pdf']],
  ['docs', ['document', 'doc', 'docx']],
  ['documents', ['document', 'doc', 'docx']],
  ['sheets', ['excel', 'xlsx', 'xls', 'csv']],
  ['links', ['link', 'url']],
  ['pics', ['image', 'photo']],
  ['photos', ['image', 'photo']],
])

export const SEARCH_TYPES = [
  { value: 'all', label: 'All types' },
  { value: 'chat', label: 'Chats' },
  { value: 'pdf', label: 'PDFs' },
  { value: 'document', label: 'Documents' },
  { value: 'excel', label: 'Excel' },
  { value: 'link', label: 'Links' },
  { value: 'image', label: 'Images' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'other', label: 'Other files' },
]

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function tokenize(value) {
  return normalize(value).split(/\s+/u).filter(Boolean)
}

function expandQueryToken(token) {
  return [token, ...(QUERY_ALIASES.get(token) ?? [])]
}

function editDistanceWithin(left, right, maximum) {
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex]
    let rowMinimum = current[0]

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      const value = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      )
      current.push(value)
      rowMinimum = Math.min(rowMinimum, value)
    }

    if (rowMinimum > maximum) return maximum + 1
    previous = current
  }

  return previous[right.length]
}

function tokenMatchScore(queryToken, candidateTokens) {
  let best = 0

  for (const expandedToken of expandQueryToken(queryToken)) {
    for (const candidate of candidateTokens) {
      if (candidate === expandedToken) best = Math.max(best, 36)
      else if (candidate.startsWith(expandedToken)) best = Math.max(best, 29)
      else if (expandedToken.length >= 4 && candidate.includes(expandedToken)) best = Math.max(best, 23)
      else if (expandedToken.length >= 4 && candidate.length >= 4) {
        const maximum = expandedToken.length <= 5 ? 1 : expandedToken.length <= 9 ? 2 : 3
        const distance = editDistanceWithin(expandedToken, candidate, maximum)
        if (distance <= maximum) best = Math.max(best, 18 - distance * 3)
      }
    }
  }

  return best
}

function makeItem({
  id,
  kind,
  chat,
  message,
  title,
  content,
  attachmentId = null,
  url = null,
  available = true,
}) {
  const sender = message?.sender ?? ''
  const searchText = [title, content, sender, chat.name, kind, `${kind}s`].join(' ')

  return {
    id,
    kind,
    chatId: chat.id,
    chatName: chat.name,
    messageId: message?.id ?? null,
    sender,
    timestamp: message?.timestamp ?? null,
    dateText: message?.dateText ?? '',
    timeText: message?.timeText ?? '',
    title,
    content,
    attachmentId,
    url,
    available,
    normalizedTitle: normalize(title),
    normalizedSender: normalize(sender),
    normalizedChat: normalize(chat.name),
    normalizedContent: normalize(content),
    tokens: tokenize(searchText),
  }
}

export function createSearchItems({ chats, messages, attachments }) {
  const chatsById = new Map(chats.map((chat) => [chat.id, chat]))
  const attachmentsById = new Map(attachments.map((attachment) => [attachment.id, attachment]))
  const items = []
  const includedAttachmentIds = new Set()

  for (const message of messages) {
    const chat = chatsById.get(message.chatId)
    if (!chat) continue

    items.push(
      makeItem({
        id: `chat:${message.id}`,
        kind: 'chat',
        chat,
        message,
        title: message.sender ?? 'WhatsApp system',
        content: message.content,
      }),
    )

    for (let index = 0; index < message.links.length; index += 1) {
      items.push(
        makeItem({
          id: `link:${message.id}:${index}`,
          kind: 'link',
          chat,
          message,
          title: message.links[index],
          content: message.content,
          url: message.links[index],
        }),
      )
    }

    for (const attachmentId of message.attachmentIds) {
      if (includedAttachmentIds.has(attachmentId)) continue
      const attachment = attachmentsById.get(attachmentId)
      if (!attachment) continue
      includedAttachmentIds.add(attachmentId)
      items.push(
        makeItem({
          id: `attachment:${attachment.id}`,
          kind: attachment.category,
          chat,
          message,
          title: attachment.name,
          content: message.content,
          attachmentId: attachment.id,
        }),
      )
    }

    const includedNames = new Set(
      message.attachmentIds
        .map((attachmentId) => attachmentsById.get(attachmentId)?.name)
        .filter(Boolean)
        .map(normalize),
    )
    for (let index = 0; index < (message.attachmentNames ?? []).length; index += 1) {
      const attachmentName = message.attachmentNames[index]
      if (includedNames.has(normalize(attachmentName))) continue
      items.push(
        makeItem({
          id: `missing:${message.id}:${index}`,
          kind: classifyAttachment(attachmentName),
          chat,
          message,
          title: attachmentName,
          content: message.content,
          available: false,
        }),
      )
    }
  }

  for (const attachment of attachments) {
    if (includedAttachmentIds.has(attachment.id)) continue
    const chat = chatsById.get(attachment.chatId)
    if (!chat) continue
    items.push(
      makeItem({
        id: `attachment:${attachment.id}`,
        kind: attachment.category,
        chat,
        message: null,
        title: attachment.name,
        content: '',
        attachmentId: attachment.id,
      }),
    )
  }

  return items
}

function matchesDateRange(item, fromDate, toDate) {
  if (!fromDate && !toDate) return true
  const date = item.timestamp?.slice(0, 10)
  if (!date) return false
  if (fromDate && date < fromDate) return false
  if (toDate && date > toDate) return false
  return true
}

function scoreItem(item, normalizedQuery, queryTokens) {
  if (!normalizedQuery) return 1

  let score = 0
  if (item.normalizedSender === normalizedQuery) score += 120
  else if (item.normalizedSender.includes(normalizedQuery)) score += 82
  if (item.normalizedTitle === normalizedQuery) score += 105
  else if (item.normalizedTitle.includes(normalizedQuery)) score += 72
  if (item.normalizedChat === normalizedQuery) score += 90
  else if (item.normalizedChat.includes(normalizedQuery)) score += 58
  if (item.normalizedContent.includes(normalizedQuery)) score += 48
  if (
    item.kind !== 'chat' &&
    queryTokens.some((token) => expandQueryToken(token).includes(item.kind))
  ) {
    score += 45
  }

  for (const queryToken of queryTokens) {
    const tokenScore = tokenMatchScore(queryToken, item.tokens)
    if (tokenScore === 0) return 0
    score += tokenScore
  }

  return score
}

export function searchItems(items, filters = {}) {
  const {
    query = '',
    sender = 'all',
    group = 'all',
    type = 'all',
    fromDate = '',
    toDate = '',
    limit = 100,
  } = filters
  const normalizedQuery = normalize(query)
  const queryTokens = tokenize(query)

  return items
    .filter((item) => sender === 'all' || item.sender === sender)
    .filter((item) => group === 'all' || item.chatId === group)
    .filter((item) => type === 'all' || item.kind === type)
    .filter((item) => matchesDateRange(item, fromDate, toDate))
    .map((item) => ({ ...item, score: scoreItem(item, normalizedQuery, queryTokens) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      return (right.timestamp ?? '').localeCompare(left.timestamp ?? '')
    })
    .slice(0, limit)
}

export function getSearchOptions(items) {
  const senders = [...new Set(items.map((item) => item.sender).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  )
  const groupsById = new Map(items.map((item) => [item.chatId, item.chatName]))
  const groups = [...groupsById].map(([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  )
  return { senders, groups }
}
