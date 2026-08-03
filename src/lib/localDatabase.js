const DATABASE_NAME = 'chatfind-local'
const DATABASE_VERSION = 1

let databasePromise

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })
}

function transactionToPromise(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true })
    transaction.addEventListener('abort', () => reject(transaction.error), { once: true })
    transaction.addEventListener('error', () => reject(transaction.error), { once: true })
  })
}

function openDatabase() {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.addEventListener('upgradeneeded', () => {
      const database = request.result

      if (!database.objectStoreNames.contains('chats')) {
        database.createObjectStore('chats', { keyPath: 'id' })
      }

      if (!database.objectStoreNames.contains('messages')) {
        const messages = database.createObjectStore('messages', { keyPath: 'id' })
        messages.createIndex('by_chat', 'chatId', { unique: false })
      }

      if (!database.objectStoreNames.contains('attachments')) {
        const attachments = database.createObjectStore('attachments', { keyPath: 'id' })
        attachments.createIndex('by_chat', 'chatId', { unique: false })
      }
    })

    request.addEventListener('success', () => {
      const database = request.result
      database.addEventListener('versionchange', () => database.close())
      resolve(database)
    })
    request.addEventListener('error', () => {
      databasePromise = undefined
      reject(request.error)
    })
    request.addEventListener('blocked', () => {
      databasePromise = undefined
      reject(new Error('ChatFind storage is open in another tab. Close the other tab and retry.'))
    })
  })

  return databasePromise
}

function normalizeForIdentity(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\r\n?/gu, '\n')
    .trim()
}

async function hashText(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function buildStorageRecords(importedChat) {
  const normalizedChatName = normalizeForIdentity(importedChat.chatName).toLocaleLowerCase()
  const chatId = await hashText(`whatsapp-chat|${normalizedChatName}`)
  const identityOccurrences = new Map()

  const messageRecords = await Promise.all(
    importedChat.messages.map(async (message) => {
      const baseIdentity = [
        chatId,
        message.timestamp ?? `${message.dateText}|${message.timeText}`,
        normalizeForIdentity(message.sender).toLocaleLowerCase(),
        normalizeForIdentity(message.content),
        [...message.attachmentNames].sort().join('|'),
      ].join('\u001f')
      const occurrence = identityOccurrences.get(baseIdentity) ?? 0
      identityOccurrences.set(baseIdentity, occurrence + 1)
      const id = await hashText(`whatsapp-message|${baseIdentity}|${occurrence}`)

      return {
        id,
        chatId,
        kind: message.kind,
        sender: message.sender,
        content: message.content,
        dateText: message.dateText,
        timeText: message.timeText,
        timestamp: message.timestamp,
        links: message.links,
        attachmentNames: message.attachmentNames,
        attachmentIds: [],
      }
    }),
  )

  const sourceMessageIdToStoredId = new Map(
    importedChat.messages.map((message, index) => [message.id, messageRecords[index].id]),
  )
  const sourceAttachmentToMessageIds = new Map()

  for (const sourceMessage of importedChat.messages) {
    for (const attachment of sourceMessage.attachments) {
      if (!sourceAttachmentToMessageIds.has(attachment.id)) {
        sourceAttachmentToMessageIds.set(attachment.id, [])
      }
      sourceAttachmentToMessageIds.get(attachment.id).push(sourceMessageIdToStoredId.get(sourceMessage.id))
    }
  }

  const attachmentRecords = await Promise.all(
    importedChat.attachments.map(async (attachment) => {
      const messageIds = [...new Set(sourceAttachmentToMessageIds.get(attachment.id) ?? [])].sort()
      const identity = [
        chatId,
        normalizeForIdentity(attachment.name).toLocaleLowerCase(),
        attachment.size,
        messageIds.join('|'),
      ].join('\u001f')
      const id = await hashText(`whatsapp-attachment|${identity}`)

      return {
        id,
        chatId,
        name: attachment.name,
        path: attachment.path,
        size: attachment.size,
        mimeType: attachment.mimeType,
        category: attachment.category,
        messageIds,
        blob: attachment.blob,
      }
    }),
  )

  const sourceAttachmentIdToStoredId = new Map(
    importedChat.attachments.map((attachment, index) => [attachment.id, attachmentRecords[index].id]),
  )
  for (let index = 0; index < importedChat.messages.length; index += 1) {
    messageRecords[index].attachmentIds = importedChat.messages[index].attachments
      .map((attachment) => sourceAttachmentIdToStoredId.get(attachment.id))
      .filter(Boolean)
  }

  return { chatId, messageRecords, attachmentRecords }
}

export async function saveImportedChat(importedChat) {
  const { chatId, messageRecords, attachmentRecords } = await buildStorageRecords(importedChat)
  const database = await openDatabase()
  const transaction = database.transaction(['chats', 'messages', 'attachments'], 'readwrite')
  const completed = transactionToPromise(transaction)
  const chatStore = transaction.objectStore('chats')
  const messageStore = transaction.objectStore('messages')
  const attachmentStore = transaction.objectStore('attachments')

  try {
    const existingChatRequest = requestToPromise(chatStore.get(chatId))
    const existingMessageRequests = messageRecords.map(({ id }) => requestToPromise(messageStore.getKey(id)))
    const existingAttachmentRequests = attachmentRecords.map(({ id }) =>
      requestToPromise(attachmentStore.getKey(id)),
    )

    const [existingChat, existingMessageIds, existingAttachmentIds] = await Promise.all([
      existingChatRequest,
      Promise.all(existingMessageRequests),
      Promise.all(existingAttachmentRequests),
    ])
    const now = new Date().toISOString()
    const newMessages = messageRecords.filter((_, index) => existingMessageIds[index] === undefined)
    const newAttachments = attachmentRecords.filter(
      (_, index) => existingAttachmentIds[index] === undefined,
    )

    for (const message of newMessages) messageStore.add(message)
    for (const attachment of newAttachments) attachmentStore.add(attachment)

    const participants = [...new Set([
      ...(existingChat?.participants ?? []),
      ...importedChat.participants,
    ])].sort((a, b) => a.localeCompare(b))
    const chat = {
      id: chatId,
      name: importedChat.chatName,
      source: 'whatsapp',
      sourceName: importedChat.sourceName,
      participants,
      messageCount: (existingChat?.messageCount ?? 0) + newMessages.length,
      attachmentCount: (existingChat?.attachmentCount ?? 0) + newAttachments.length,
      createdAt: existingChat?.createdAt ?? now,
      updatedAt: now,
    }
    chatStore.put(chat)
    await completed

    return {
      chat,
      addedMessages: newMessages.length,
      duplicateMessages: messageRecords.length - newMessages.length,
      addedAttachments: newAttachments.length,
      duplicateAttachments: attachmentRecords.length - newAttachments.length,
    }
  } catch (error) {
    try {
      transaction.abort()
    } catch {
      // The transaction may already be completed or aborted.
    }
    if (error?.name === 'QuotaExceededError') {
      throw new Error('This device does not have enough browser storage for that export.')
    }
    throw error
  }
}

export async function listStoredChats() {
  const database = await openDatabase()
  const transaction = database.transaction('chats', 'readonly')
  const completed = transactionToPromise(transaction)
  const chats = await requestToPromise(transaction.objectStore('chats').getAll())
  await completed
  return chats.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function loadStoredChat(chatId) {
  const database = await openDatabase()
  const transaction = database.transaction(['chats', 'messages', 'attachments'], 'readonly')
  const completed = transactionToPromise(transaction)
  const chatRequest = requestToPromise(transaction.objectStore('chats').get(chatId))
  const messagesRequest = requestToPromise(
    transaction.objectStore('messages').index('by_chat').getAll(IDBKeyRange.only(chatId)),
  )
  const attachmentsRequest = requestToPromise(
    transaction.objectStore('attachments').index('by_chat').getAll(IDBKeyRange.only(chatId)),
  )
  const [chat, storedMessages, storedAttachments] = await Promise.all([
    chatRequest,
    messagesRequest,
    attachmentsRequest,
  ])
  await completed

  if (!chat) throw new Error('That saved chat no longer exists on this device.')

  const attachments = storedAttachments.map((attachment) => ({
    ...attachment,
    url: URL.createObjectURL(attachment.blob),
    matched: attachment.messageIds.length > 0,
  }))
  const attachmentsById = new Map(attachments.map((attachment) => [attachment.id, attachment]))
  const messages = storedMessages
    .map((message) => ({
      ...message,
      attachments: message.attachmentIds.map((id) => attachmentsById.get(id)).filter(Boolean),
    }))
    .sort((a, b) => (a.timestamp ?? '').localeCompare(b.timestamp ?? ''))

  return {
    chatName: chat.name,
    sourceName: chat.sourceName,
    participants: chat.participants,
    dateOrder: null,
    messages,
    attachments,
    storedChatId: chat.id,
  }
}

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null
  const estimate = await navigator.storage.estimate()
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
  }
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false
  return navigator.storage.persist()
}

export async function deleteLocalDatabaseForTests() {
  if (databasePromise) {
    const database = await databasePromise
    database.close()
    databasePromise = undefined
  }

  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME)
    request.addEventListener('success', () => resolve(), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
    request.addEventListener('blocked', () => reject(new Error('Test database deletion was blocked.')), {
      once: true,
    })
  })
}
