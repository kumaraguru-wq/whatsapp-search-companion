import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { importWhatsAppFile, releaseImport } from '../src/lib/importWhatsApp.js'
import {
  clearLocalLibrary,
  deleteLocalDatabaseForTests,
  exportLocalSnapshot,
  getStoredAttachment,
  getSavedState,
  listStoredChats,
  loadMessageContext,
  loadStoredChat,
  restoreLocalSnapshot,
  saveImportedChat,
  toggleBookmarkedItem,
} from '../src/lib/localDatabase.js'

test('clears all local chat history, files and stars', async () => {
  await deleteLocalDatabaseForTests()
  await restoreLocalSnapshot({
    chats: [{ id: 'clear-chat', name: 'Clear Me', updatedAt: '2026-08-03T10:00:00.000Z' }],
    messages: [{ id: 'clear-message', chatId: 'clear-chat' }],
    attachments: [{
      id: 'clear-file',
      chatId: 'clear-chat',
      blob: new Blob(['file']),
    }],
    bookmarks: [{ id: 'chat:clear-message' }],
  })

  await clearLocalLibrary()
  const snapshot = await exportLocalSnapshot()
  assert.deepEqual(snapshot, { chats: [], messages: [], attachments: [], bookmarks: [] })
  await deleteLocalDatabaseForTests()
})

test('exports and safely restores a complete local snapshot', async () => {
  await deleteLocalDatabaseForTests()
  const snapshot = {
    chats: [{
      id: 'backup-chat',
      name: 'Backup Chat',
      messageCount: 1,
      attachmentCount: 1,
      updatedAt: '2026-08-03T10:00:00.000Z',
    }],
    messages: [{
      id: 'backup-message',
      chatId: 'backup-chat',
      sender: 'Teacher',
      content: 'Circular',
      timestamp: '2026-08-03T10:00:00',
      links: [],
      attachmentIds: ['backup-file'],
    }],
    attachments: [{
      id: 'backup-file',
      chatId: 'backup-chat',
      name: 'Circular.pdf',
      messageIds: ['backup-message'],
      blob: new Blob(['%PDF-backup'], { type: 'application/pdf' }),
    }],
    bookmarks: [{ id: 'chat:backup-message', createdAt: '2026-08-03T10:01:00.000Z' }],
  }

  const report = await restoreLocalSnapshot(snapshot)
  const exported = await exportLocalSnapshot()
  assert.deepEqual(report, { chats: 1, messages: 1, attachments: 1, bookmarks: 1 })
  assert.equal(exported.chats[0].name, 'Backup Chat')
  assert.equal(exported.messages[0].content, 'Circular')
  assert.equal(await exported.attachments[0].blob.text(), '%PDF-backup')
  assert.equal(exported.bookmarks[0].id, 'chat:backup-message')

  await restoreLocalSnapshot({
    ...snapshot,
    chats: [{ ...snapshot.chats[0], name: 'Older Backup', updatedAt: '2026-08-01T10:00:00.000Z' }],
  })
  assert.equal((await listStoredChats())[0].name, 'Backup Chat')
  await deleteLocalDatabaseForTests()
})

test('persists and removes starred items', async () => {
  await deleteLocalDatabaseForTests()

  assert.equal(await toggleBookmarkedItem('chat:message-1'), true)
  assert.deepEqual(await getSavedState(), {
    bookmarkedItemIds: ['chat:message-1'],
  })

  assert.equal(await toggleBookmarkedItem('chat:message-1'), false)
  assert.deepEqual(await getSavedState(), { bookmarkedItemIds: [] })
  await deleteLocalDatabaseForTests()
})

test('removes the old pin store without removing existing conversations', async () => {
  await deleteLocalDatabaseForTests()
  const legacyDatabase = await new Promise((resolve, reject) => {
    const request = indexedDB.open('chatfind-local', 2)
    request.addEventListener('upgradeneeded', () => {
      const database = request.result
      database.createObjectStore('chats', { keyPath: 'id' })
      const messages = database.createObjectStore('messages', { keyPath: 'id' })
      messages.createIndex('by_chat', 'chatId', { unique: false })
      const attachments = database.createObjectStore('attachments', { keyPath: 'id' })
      attachments.createIndex('by_chat', 'chatId', { unique: false })
      database.createObjectStore('bookmarks', { keyPath: 'id' })
      database.createObjectStore('pinnedChats', { keyPath: 'id' })
    })
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })
  const transaction = legacyDatabase.transaction(['chats', 'pinnedChats'], 'readwrite')
  transaction.objectStore('chats').add({
    id: 'existing-chat',
    name: 'Existing Staff Chat',
    messageCount: 0,
    attachmentCount: 0,
    updatedAt: '2026-08-01T00:00:00.000Z',
  })
  transaction.objectStore('pinnedChats').add({ id: 'existing-chat' })
  await new Promise((resolve, reject) => {
    transaction.addEventListener('complete', resolve, { once: true })
    transaction.addEventListener('error', () => reject(transaction.error), { once: true })
  })
  legacyDatabase.close()

  assert.deepEqual(await getSavedState(), { bookmarkedItemIds: [] })
  assert.equal((await listStoredChats())[0].name, 'Existing Staff Chat')
  const upgradedDatabase = await new Promise((resolve, reject) => {
    const request = indexedDB.open('chatfind-local', 3)
    request.addEventListener('success', () => resolve(request.result), { once: true })
    request.addEventListener('error', () => reject(request.error), { once: true })
  })
  assert.equal(upgradedDatabase.objectStoreNames.contains('pinnedChats'), false)
  upgradedDatabase.close()
  await deleteLocalDatabaseForTests()
})

test('persists an import and skips the same messages and attachment on re-import', async () => {
  await deleteLocalDatabaseForTests()
  const zip = new JSZip()
  zip.file(
    'WhatsApp Chat with Teachers.txt',
    '03/08/2026, 9:29 am - Headmistress: Circular.pdf (file attached)\n' +
      '03/08/2026, 9:30 am - Teacher: Received\n' +
      '03/08/2026, 9:30 am - Teacher: Received',
  )
  zip.file('Circular.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]))
  const archive = await zip.generateAsync({ type: 'uint8array' })

  const firstImport = await importWhatsAppFile(
    new File([archive], 'teachers.zip', { type: 'application/zip' }),
  )
  const firstResult = await saveImportedChat(firstImport)
  releaseImport(firstImport)

  const secondImport = await importWhatsAppFile(
    new File([archive], 'teachers-again.zip', { type: 'application/zip' }),
  )
  const secondResult = await saveImportedChat(secondImport)
  releaseImport(secondImport)

  assert.equal(firstResult.addedMessages, 3)
  assert.equal(firstResult.addedAttachments, 1)
  assert.equal(secondResult.addedMessages, 0)
  assert.equal(secondResult.duplicateMessages, 3)
  assert.equal(secondResult.addedAttachments, 0)
  assert.equal(secondResult.duplicateAttachments, 1)

  const chats = await listStoredChats()
  assert.equal(chats.length, 1)
  assert.equal(chats[0].messageCount, 3)
  assert.equal(chats[0].attachmentCount, 1)
  assert.equal(chats[0].latestMessageAt, '2026-08-03T09:30:00')

  const stored = await loadStoredChat(chats[0].id)
  try {
    assert.equal(stored.messages.length, 3)
    assert.equal(stored.attachments.length, 1)
    assert.equal(stored.messages[0].attachments[0].name, 'Circular.pdf')
    assert.equal(await stored.attachments[0].blob.text(), '%PDF')
    const openedAttachment = await getStoredAttachment(stored.attachments[0].id)
    assert.equal(openedAttachment.name, 'Circular.pdf')
    assert.equal(openedAttachment.mimeType, 'application/pdf')
    const context = await loadMessageContext(chats[0].id, stored.messages[0].id, 1)
    try {
      assert.equal(context.selectedMessageId, stored.messages[0].id)
      assert.equal(context.messages.length, 2)
      assert.equal(context.messages[0].attachments[0].name, 'Circular.pdf')
    } finally {
      releaseImport(context)
    }
  } finally {
    releaseImport(stored)
    await deleteLocalDatabaseForTests()
  }
})

test('links a file downloaded later to its already stored message', async () => {
  await deleteLocalDatabaseForTests()
  const transcript = '03/08/2026, 9:29 am - Headmistress: Circular.pdf (file attached)'
  const textOnly = await importWhatsAppFile(
    new File([transcript], 'WhatsApp Chat with Teachers.txt', { type: 'text/plain' }),
  )
  const firstResult = await saveImportedChat(textOnly)
  releaseImport(textOnly)

  const zip = new JSZip()
  zip.file('WhatsApp Chat with Teachers.txt', transcript)
  zip.file('Circular.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]))
  const archive = await zip.generateAsync({ type: 'uint8array' })
  const withMedia = await importWhatsAppFile(
    new File([archive], 'teachers-with-media.zip', { type: 'application/zip' }),
  )
  const secondResult = await saveImportedChat(withMedia)
  releaseImport(withMedia)

  assert.equal(firstResult.addedMessages, 1)
  assert.equal(firstResult.addedAttachments, 0)
  assert.equal(secondResult.addedMessages, 0)
  assert.equal(secondResult.duplicateMessages, 1)
  assert.equal(secondResult.addedAttachments, 1)

  const chat = (await listStoredChats())[0]
  const stored = await loadStoredChat(chat.id)
  try {
    assert.equal(stored.messages.length, 1)
    assert.equal(stored.messages[0].attachments.length, 1)
    assert.equal(stored.messages[0].attachments[0].name, 'Circular.pdf')
  } finally {
    releaseImport(stored)
    await deleteLocalDatabaseForTests()
  }
})
