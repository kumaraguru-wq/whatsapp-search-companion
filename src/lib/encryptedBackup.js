import JSZip from 'jszip'

const MAGIC = new TextEncoder().encode('CHATFND1')
const SALT_LENGTH = 16
const IV_LENGTH = 12
const KEY_ITERATIONS = 250_000

function assertPassword(password) {
  if (typeof password !== 'string' || password.length < 8) {
    throw new Error('Use a backup password with at least 8 characters.')
  }
}

async function deriveKey(password, salt) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: KEY_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

function startsWithMagic(bytes) {
  return MAGIC.every((value, index) => bytes[index] === value)
}

export async function createEncryptedBackup(snapshot, password) {
  assertPassword(password)
  const zip = new JSZip()
  const attachments = []

  for (const attachment of snapshot.attachments) {
    const entryName = `attachments/${attachment.id}`
    zip.file(entryName, await attachment.blob.arrayBuffer())
    const { blob, ...metadata } = attachment
    attachments.push({ ...metadata, entryName, blobType: blob.type })
  }

  zip.file('manifest.json', JSON.stringify({
    format: 'chatfind-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    chats: snapshot.chats,
    messages: snapshot.messages,
    bookmarks: snapshot.bookmarks,
    attachments,
  }))
  const archive = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const key = await deriveKey(password, salt)
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, archive))
  const output = new Uint8Array(MAGIC.length + salt.length + iv.length + encrypted.length)
  output.set(MAGIC, 0)
  output.set(salt, MAGIC.length)
  output.set(iv, MAGIC.length + salt.length)
  output.set(encrypted, MAGIC.length + salt.length + iv.length)
  return new Blob([output], { type: 'application/octet-stream' })
}

export async function openEncryptedBackup(file, password) {
  assertPassword(password)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const headerLength = MAGIC.length + SALT_LENGTH + IV_LENGTH
  if (bytes.length <= headerLength || !startsWithMagic(bytes)) {
    throw new Error('Choose a valid ChatFind backup file.')
  }

  const salt = bytes.slice(MAGIC.length, MAGIC.length + SALT_LENGTH)
  const iv = bytes.slice(MAGIC.length + SALT_LENGTH, headerLength)
  const encrypted = bytes.slice(headerLength)
  const key = await deriveKey(password, salt)
  let decrypted
  try {
    decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted)
  } catch {
    throw new Error('The backup password is incorrect, or this file is damaged.')
  }

  let zip
  try {
    zip = await JSZip.loadAsync(decrypted)
  } catch {
    throw new Error('The decrypted backup data is damaged.')
  }
  const manifestEntry = zip.file('manifest.json')
  if (!manifestEntry) throw new Error('This backup is missing its manifest.')
  const manifest = JSON.parse(await manifestEntry.async('text'))
  if (manifest.format !== 'chatfind-backup' || manifest.version !== 1) {
    throw new Error('This ChatFind backup version is not supported.')
  }

  const attachments = await Promise.all((manifest.attachments ?? []).map(async (metadata) => {
    const entry = zip.file(metadata.entryName)
    if (!entry) throw new Error(`The backup is missing ${metadata.name ?? 'an attachment'}.`)
    const { entryName, blobType, ...attachment } = metadata
    return {
      ...attachment,
      blob: new Blob([await entry.async('arraybuffer')], {
        type: blobType || attachment.mimeType || 'application/octet-stream',
      }),
    }
  }))

  return {
    chats: manifest.chats ?? [],
    messages: manifest.messages ?? [],
    bookmarks: manifest.bookmarks ?? [],
    attachments,
    createdAt: manifest.createdAt,
  }
}
