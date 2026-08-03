const DATE_PART = String.raw`\d{1,4}[./-]\d{1,2}[./-]\d{1,4}`
const TIME_PART = String.raw`\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp]\.?[Mm]\.?)?`

const BRACKETED_HEADER = new RegExp(
  String.raw`^\[(${DATE_PART}),\s*(${TIME_PART})\]\s*(.*)$`,
  'u',
)
const DASH_HEADER = new RegExp(
  String.raw`^(${DATE_PART}),\s*(${TIME_PART})\s+-\s+(.*)$`,
  'u',
)
const SENDER_MESSAGE = /^(.{1,120}?):\s([\s\S]*)$/u
const LINK_PATTERN = /https?:\/\/[^\s<>]+/giu
const ATTACHED_TAG = /<attached:\s*([^>]+)>/giu
const FILE_ATTACHED_LINE = /^(.+?\.[a-z0-9]{2,10})\s+\(file attached\)/gimu

function normalizeLine(line) {
  return line
    .replace(/^\uFEFF/u, '')
    .replace(/[\u200E\u200F]/gu, '')
    .replace(/\u202F/gu, ' ')
}

function matchHeader(line) {
  const normalized = normalizeLine(line)
  const match = normalized.match(BRACKETED_HEADER) ?? normalized.match(DASH_HEADER)
  if (!match) return null

  return {
    dateText: match[1],
    timeText: match[2],
    remainder: match[3],
  }
}

function inferDateOrder(entries) {
  for (const entry of entries) {
    const parts = entry.dateText.split(/[./-]/u)
    if (parts[0].length === 4) return 'ymd'

    const first = Number(parts[0])
    const second = Number(parts[1])
    if (first > 12) return 'dmy'
    if (second > 12) return 'mdy'
  }

  // WhatsApp exports do not record their locale. Day-first is the safest
  // default for this India-focused application when all dates are ambiguous.
  return 'dmy'
}

function normalizeYear(value) {
  if (value >= 100) return value
  return value >= 70 ? 1900 + value : 2000 + value
}

function toTimestamp(dateText, timeText, order) {
  const dateParts = dateText.split(/[./-]/u).map(Number)
  let year
  let month
  let day

  if (order === 'ymd') {
    ;[year, month, day] = dateParts
  } else if (order === 'mdy') {
    ;[month, day, year] = dateParts
  } else {
    ;[day, month, year] = dateParts
  }

  year = normalizeYear(year)

  const normalizedTime = timeText.replace(/\./gu, '').trim().toUpperCase()
  const timeMatch = normalizedTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/u)
  if (!timeMatch) return null

  let hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  const second = Number(timeMatch[3] ?? 0)
  const meridiem = timeMatch[4]

  if (meridiem === 'AM' && hour === 12) hour = 0
  if (meridiem === 'PM' && hour < 12) hour += 12

  const candidate = new Date(year, month - 1, day, hour, minute, second)
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day ||
    candidate.getHours() !== hour ||
    candidate.getMinutes() !== minute
  ) {
    return null
  }

  const pad = (value) => String(value).padStart(2, '0')
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`
}

function trimLink(link) {
  return link.replace(/[),.!?;:'\"]+$/gu, '')
}

function extractLinks(content) {
  return [...content.matchAll(LINK_PATTERN)].map((match) => trimLink(match[0]))
}

function extractAttachmentNames(content) {
  const names = []

  for (const match of content.matchAll(ATTACHED_TAG)) names.push(match[1].trim())
  for (const match of content.matchAll(FILE_ATTACHED_LINE)) names.push(match[1].trim())

  return [...new Set(names)]
}

function makeRecord(entry, index, dateOrder) {
  const senderMatch = entry.remainder.match(SENDER_MESSAGE)
  const sender = senderMatch?.[1]?.trim() || null
  const content = senderMatch ? senderMatch[2] : entry.remainder

  return {
    id: `message-${index + 1}`,
    kind: sender ? 'message' : 'system',
    sender,
    content,
    dateText: entry.dateText,
    timeText: entry.timeText,
    timestamp: toTimestamp(entry.dateText, entry.timeText, dateOrder),
    links: extractLinks(content),
    attachmentNames: extractAttachmentNames(content),
    attachments: [],
  }
}

export function parseWhatsAppText(text) {
  if (typeof text !== 'string') throw new TypeError('WhatsApp export must be text.')

  const lines = text.replace(/\r\n?/gu, '\n').split('\n')
  const entries = []
  let current = null

  for (const rawLine of lines) {
    const header = matchHeader(rawLine)
    if (header) {
      if (current) entries.push(current)
      current = header
      continue
    }

    if (current) current.remainder += `\n${normalizeLine(rawLine)}`
  }

  if (current) entries.push(current)
  if (entries.length === 0) {
    throw new Error('No WhatsApp messages were recognized in this file.')
  }

  const dateOrder = inferDateOrder(entries)
  const messages = entries.map((entry, index) => makeRecord(entry, index, dateOrder))

  return {
    messages,
    dateOrder,
    participants: [...new Set(messages.map((message) => message.sender).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b),
    ),
  }
}

export function inferChatName(filename) {
  const basename = filename.split(/[\\/]/u).pop()?.replace(/\.(txt|zip)$/iu, '') ?? ''
  const cleaned = basename
    .replace(/^WhatsApp Chat (with|-)[ ]*/iu, '')
    .replace(/^_?chat$/iu, '')
    .replace(/[_-]+/gu, ' ')
    .trim()

  return cleaned || 'Imported chat'
}

export function classifyAttachment(filename) {
  const extension = filename.split('.').pop()?.toLowerCase() ?? ''
  if (extension === 'pdf') return 'pdf'
  if (['xls', 'xlsx', 'xlsm', 'csv'].includes(extension)) return 'excel'
  if (['doc', 'docx', 'odt', 'rtf', 'txt', 'ppt', 'pptx'].includes(extension)) return 'document'
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'svg'].includes(extension)) return 'image'
  if (['mp3', 'm4a', 'ogg', 'opus', 'wav', 'aac'].includes(extension)) return 'audio'
  if (['mp4', 'mov', 'm4v', 'webm', '3gp'].includes(extension)) return 'video'
  return 'other'
}

