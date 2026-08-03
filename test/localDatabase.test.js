import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { importWhatsAppFile, releaseImport } from '../src/lib/importWhatsApp.js'
import {
  deleteLocalDatabaseForTests,
  getStoredAttachment,
  listStoredChats,
  loadStoredChat,
  saveImportedChat,
} from '../src/lib/localDatabase.js'

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

  const stored = await loadStoredChat(chats[0].id)
  try {
    assert.equal(stored.messages.length, 3)
    assert.equal(stored.attachments.length, 1)
    assert.equal(stored.messages[0].attachments[0].name, 'Circular.pdf')
    assert.equal(await stored.attachments[0].blob.text(), '%PDF')
    const openedAttachment = await getStoredAttachment(stored.attachments[0].id)
    assert.equal(openedAttachment.name, 'Circular.pdf')
    assert.equal(openedAttachment.mimeType, 'application/pdf')
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
