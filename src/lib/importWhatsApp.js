import JSZip from 'jszip'
import { classifyAttachment, inferChatName, parseWhatsAppText } from './whatsappParser.js'

const MAX_IMPORT_SIZE = 300 * 1024 * 1024
const ZIP_MIME_TYPES = new Set([
  'application/zip',
  'application/x-zip-compressed',
  'multipart/x-zip',
])

function decodeText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2))
  }
  return new TextDecoder('utf-8').decode(bytes)
}

function basename(path) {
  return path.split(/[\\/]/u).pop() ?? path
}

function normalizeFilename(path) {
  return basename(path).normalize('NFKC').toLocaleLowerCase()
}

async function importTextFile(file) {
  const text = decodeText(new Uint8Array(await file.arrayBuffer()))
  const parsed = parseWhatsAppText(text)
  return {
    ...parsed,
    chatName: inferChatName(file.name),
    sourceName: file.name,
    attachments: [],
  }
}

async function selectTranscript(textEntries) {
  let best = null

  for (const entry of textEntries) {
    try {
      const bytes = await entry.async('uint8array')
      const parsed = parseWhatsAppText(decodeText(bytes))
      if (!best || parsed.messages.length > best.parsed.messages.length) {
        best = { entry, parsed }
      }
    } catch {
      // A ZIP can legitimately contain ordinary .txt attachments. They are
      // ignored when they do not resemble a WhatsApp transcript.
    }
  }

  if (!best) throw new Error('The ZIP does not contain a recognizable WhatsApp chat transcript.')
  return best
}

async function importZipFile(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const entries = Object.values(zip.files).filter(
    (entry) => !entry.dir && !entry.name.startsWith('__MACOSX/'),
  )
  const textEntries = entries.filter((entry) => entry.name.toLowerCase().endsWith('.txt'))
  if (textEntries.length === 0) throw new Error('The ZIP does not contain a .txt chat transcript.')

  const transcript = await selectTranscript(textEntries)
  const fileEntries = entries.filter((entry) => entry.name !== transcript.entry.name)
  const attachments = await Promise.all(
    fileEntries.map(async (entry, index) => {
      const blob = await entry.async('blob')
      const name = basename(entry.name)
      return {
        id: `attachment-${index + 1}`,
        name,
        path: entry.name,
        size: blob.size,
        mimeType: blob.type || 'application/octet-stream',
        category: classifyAttachment(name),
        blob,
        url: URL.createObjectURL(blob),
      }
    }),
  )

  const byName = new Map()
  for (const attachment of attachments) {
    const key = normalizeFilename(attachment.name)
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key).push(attachment)
  }

  const messages = transcript.parsed.messages.map((message) => ({
    ...message,
    attachments: message.attachmentNames.flatMap(
      (name) => byName.get(normalizeFilename(name)) ?? [],
    ),
  }))
  const matchedIds = new Set(messages.flatMap((message) => message.attachments.map(({ id }) => id)))

  return {
    ...transcript.parsed,
    messages,
    chatName:
      inferChatName(transcript.entry.name) === 'Imported chat'
        ? inferChatName(file.name)
        : inferChatName(transcript.entry.name),
    sourceName: file.name,
    attachments: attachments.map((attachment) => ({
      ...attachment,
      matched: matchedIds.has(attachment.id),
    })),
  }
}

async function detectImportType(file) {
  const extension = file.name.trim().split('.').pop()?.toLowerCase()
  if (extension === 'txt') return 'txt'
  if (extension === 'zip' || ZIP_MIME_TYPES.has(file.type.toLowerCase())) return 'zip'

  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  const isZip =
    signature[0] === 0x50 &&
    signature[1] === 0x4b &&
    ((signature[2] === 0x03 && signature[3] === 0x04) ||
      (signature[2] === 0x05 && signature[3] === 0x06) ||
      (signature[2] === 0x07 && signature[3] === 0x08))

  if (isZip) return 'zip'
  if (file.type.toLowerCase().startsWith('text/')) return 'txt'
  return null
}

export async function importWhatsAppFile(file) {
  if (!(file instanceof File)) throw new TypeError('Choose a WhatsApp .txt or .zip file.')
  if (file.size > MAX_IMPORT_SIZE) {
    throw new Error('This export is larger than 300 MB. Try exporting without videos or other media.')
  }

  const importType = await detectImportType(file)
  if (importType === 'txt') return importTextFile(file)
  if (importType === 'zip') return importZipFile(file)
  throw new Error(`“${file.name}” is not a WhatsApp .txt or .zip export.`)
}

export function releaseImport(importedChat) {
  for (const attachment of importedChat?.attachments ?? []) URL.revokeObjectURL(attachment.url)
}
