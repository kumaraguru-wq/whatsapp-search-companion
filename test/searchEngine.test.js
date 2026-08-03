import test from 'node:test'
import assert from 'node:assert/strict'
import { createSearchItems, searchItems } from '../src/lib/searchEngine.js'

const corpus = {
  chats: [
    { id: 'staff', name: 'School Staff' },
    { id: 'math', name: 'Mathematics Department' },
  ],
  messages: [
    {
      id: 'm1',
      chatId: 'staff',
      sender: 'Headmistress',
      content: 'Class 10 quarterly exam timetable',
      timestamp: '2026-06-10T09:00:00',
      dateText: '10/06/2026',
      timeText: '9:00 am',
      links: [],
      attachmentIds: ['a1'],
      attachmentNames: ['Exam Timetable.pdf'],
    },
    {
      id: 'm2',
      chatId: 'staff',
      sender: 'Ramesh Sir',
      content: 'Registration form https://school.example/register',
      timestamp: '2026-07-01T10:00:00',
      dateText: '01/07/2026',
      timeText: '10:00 am',
      links: ['https://school.example/register'],
      attachmentIds: [],
      attachmentNames: [],
    },
    {
      id: 'm3',
      chatId: 'math',
      sender: 'Ramesh Sir',
      content: 'June fee details',
      timestamp: '2026-06-20T11:00:00',
      dateText: '20/06/2026',
      timeText: '11:00 am',
      links: [],
      attachmentIds: ['a2'],
      attachmentNames: ['Fee Details.xlsx'],
    },
  ],
  attachments: [
    { id: 'a1', chatId: 'staff', name: 'Exam Timetable.pdf', category: 'pdf' },
    { id: 'a2', chatId: 'math', name: 'Fee Details.xlsx', category: 'excel' },
  ],
}

const items = createSearchItems(corpus)

test('creates separate searchable chat, link and attachment items', () => {
  assert.equal(items.filter((item) => item.kind === 'chat').length, 3)
  assert.equal(items.filter((item) => item.kind === 'link').length, 1)
  assert.equal(items.filter((item) => item.kind === 'pdf').length, 1)
  assert.equal(items.filter((item) => item.kind === 'excel').length, 1)
  assert.equal(items.find((item) => item.kind === 'pdf').messageId, 'm1')
})

test('finds partial keywords and ranks the matching attachment', () => {
  const results = searchItems(items, { query: 'exam time' })
  assert.equal(results[0].kind, 'pdf')
  assert.equal(results[0].title, 'Exam Timetable.pdf')
})

test('tolerates a misspelled sender name', () => {
  const results = searchItems(items, { query: 'hedmistres' })
  assert.ok(results.length > 0)
  assert.equal(results[0].sender, 'Headmistress')
})

test('supports common school aliases and type words', () => {
  const results = searchItems(items, { query: 'HM PDFs' })
  assert.equal(results[0].title, 'Exam Timetable.pdf')
})

test('applies sender, group, type and date filters together', () => {
  const results = searchItems(items, {
    sender: 'Ramesh Sir',
    group: 'math',
    type: 'excel',
    fromDate: '2026-06-01',
    toDate: '2026-06-30',
  })
  assert.equal(results.length, 1)
  assert.equal(results[0].title, 'Fee Details.xlsx')
})

test('shows a referenced attachment as unavailable when it was omitted from the ZIP', () => {
  const missingItems = createSearchItems({
    chats: [{ id: 'staff', name: 'School Staff' }],
    messages: [{
      id: 'missing-message',
      chatId: 'staff',
      sender: 'Headmistress',
      content: 'Missing Circular.pdf (file attached)',
      timestamp: '2026-06-10T09:00:00',
      dateText: '10/06/2026',
      timeText: '9:00 am',
      links: [],
      attachmentIds: [],
      attachmentNames: ['Missing Circular.pdf'],
    }],
    attachments: [],
  })

  const result = searchItems(missingItems, { query: 'missing pdf' })[0]
  assert.equal(result.kind, 'pdf')
  assert.equal(result.available, false)
  assert.equal(result.attachmentId, null)
})
