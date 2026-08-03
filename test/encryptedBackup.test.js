import test from 'node:test'
import assert from 'node:assert/strict'
import { createEncryptedBackup, openEncryptedBackup } from '../src/lib/encryptedBackup.js'

const snapshot = {
  chats: [{ id: 'staff', name: 'School Staff' }],
  messages: [{ id: 'm1', chatId: 'staff', content: 'Exam timetable' }],
  bookmarks: [{ id: 'chat:m1', createdAt: '2026-08-03T10:00:00.000Z' }],
  attachments: [{
    id: 'a1',
    chatId: 'staff',
    name: 'Timetable.pdf',
    mimeType: 'application/pdf',
    blob: new Blob(['%PDF-test'], { type: 'application/pdf' }),
  }],
}

test('encrypts and decrypts a complete local backup', async () => {
  const encrypted = await createEncryptedBackup(snapshot, 'school-safe-2026')
  const restored = await openEncryptedBackup(encrypted, 'school-safe-2026')

  assert.equal(restored.chats[0].name, 'School Staff')
  assert.equal(restored.messages[0].content, 'Exam timetable')
  assert.equal(restored.bookmarks[0].id, 'chat:m1')
  assert.equal(restored.attachments[0].name, 'Timetable.pdf')
  assert.equal(await restored.attachments[0].blob.text(), '%PDF-test')
})

test('rejects a wrong password and invalid backup files', async () => {
  const encrypted = await createEncryptedBackup(snapshot, 'school-safe-2026')
  await assert.rejects(
    openEncryptedBackup(encrypted, 'incorrect-password'),
    /password is incorrect|file is damaged/u,
  )
  await assert.rejects(
    openEncryptedBackup(new Blob(['not a backup']), 'school-safe-2026'),
    /valid ChatFind backup/u,
  )
})
