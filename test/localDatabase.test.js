import 'fake-indexeddb/auto'
import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { importWhatsAppFile, releaseImport } from '../src/lib/importWhatsApp.js'
import {
  deleteLocalDatabaseForTests,
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
  } finally {
    releaseImport(stored)
    await deleteLocalDatabaseForTests()
  }
})
