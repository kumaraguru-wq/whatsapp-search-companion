import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { importWhatsAppFile, releaseImport } from '../src/lib/importWhatsApp.js'
import {
  classifyAttachment,
  inferChatName,
  parseWhatsAppText,
} from '../src/lib/whatsappParser.js'

test('parses Android day-first messages, links, attachments and continuations', () => {
  const result = parseWhatsAppText(`31/07/2026, 9:05 pm - Headmistress: Exam timetable attached\nExam_Timetable.pdf (file attached)\n31/07/2026, 9:06 pm - Ramesh Sir: Please check https://school.example/form.\n31/07/2026, 9:07 pm - Messages and calls are end-to-end encrypted.`)

  assert.equal(result.dateOrder, 'dmy')
  assert.equal(result.messages.length, 3)
  assert.equal(result.messages[0].sender, 'Headmistress')
  assert.equal(result.messages[0].timestamp, '2026-07-31T21:05:00')
  assert.deepEqual(result.messages[0].attachmentNames, ['Exam_Timetable.pdf'])
  assert.deepEqual(result.messages[1].links, ['https://school.example/form'])
  assert.equal(result.messages[2].kind, 'system')
})

test('parses bracketed iPhone exports and attached tags', () => {
  const result = parseWhatsAppText(`[7/31/26, 9:05:03 PM] Anitha Ma'am: Photo\n<attached: IMG-20260731-WA0001.jpg>\n[7/31/26, 9:06:00 PM] Office: Received`)

  assert.equal(result.dateOrder, 'mdy')
  assert.equal(result.messages[0].timestamp, '2026-07-31T21:05:03')
  assert.equal(result.messages[0].sender, "Anitha Ma'am")
  assert.deepEqual(result.messages[0].attachmentNames, ['IMG-20260731-WA0001.jpg'])
})

test('defaults ambiguous dates to day-first and preserves multiline content', () => {
  const result = parseWhatsAppText(`03/04/26, 08:10 - Teacher: First line\nSecond line`)

  assert.equal(result.dateOrder, 'dmy')
  assert.equal(result.messages[0].timestamp, '2026-04-03T08:10:00')
  assert.equal(result.messages[0].content, 'First line\nSecond line')
})

test('rejects files with no recognizable WhatsApp messages', () => {
  assert.throws(() => parseWhatsAppText('ordinary document text'), /No WhatsApp messages/)
})

test('classifies attachments and cleans chat names', () => {
  assert.equal(classifyAttachment('fees.XLSX'), 'excel')
  assert.equal(classifyAttachment('notice.pdf'), 'pdf')
  assert.equal(classifyAttachment('photo.jpeg'), 'image')
  assert.equal(inferChatName('WhatsApp Chat with School Staff.zip'), 'School Staff')
  assert.equal(inferChatName('_chat.txt'), 'Imported chat')
})

test('opens ZIP exports and matches an extracted file to its message', async () => {
  const zip = new JSZip()
  zip.file('_chat.txt', '31/07/2026, 9:05 pm - Headmistress: Circular.pdf (file attached)')
  zip.file('Circular.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46]))
  const archive = await zip.generateAsync({ type: 'uint8array' })
  const file = new File([archive], 'WhatsApp Chat with School Staff.zip', {
    type: 'application/zip',
  })

  const imported = await importWhatsAppFile(file)
  try {
    assert.equal(imported.chatName, 'School Staff')
    assert.equal(imported.messages.length, 1)
    assert.equal(imported.attachments.length, 1)
    assert.equal(imported.attachments[0].category, 'pdf')
    assert.equal(imported.attachments[0].matched, true)
    assert.equal(imported.messages[0].attachments[0].name, 'Circular.pdf')
  } finally {
    releaseImport(imported)
  }
})
