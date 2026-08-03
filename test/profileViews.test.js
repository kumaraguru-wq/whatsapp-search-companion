import test from 'node:test'
import assert from 'node:assert/strict'
import { createProfileDirectory, createProfileView, filterProfileItems } from '../src/lib/profileViews.js'

const items = [
  { id: 'm1', kind: 'chat', chatId: 'staff', chatName: 'Staff', sender: 'Headmistress', timestamp: '2026-08-01T09:00:00' },
  { id: 'f1', kind: 'pdf', chatId: 'staff', chatName: 'Staff', sender: 'Headmistress', timestamp: '2026-08-01T09:00:00' },
  { id: 'm2', kind: 'chat', chatId: 'math', chatName: 'Math', sender: 'Headmistress', timestamp: '2026-08-03T10:00:00' },
  { id: 'l1', kind: 'link', chatId: 'math', chatName: 'Math', sender: 'Ramesh Sir', timestamp: '2026-08-02T11:00:00' },
]

test('builds person and group directory summaries', () => {
  const directory = createProfileDirectory(items)
  const headmistress = directory.people.find((person) => person.name === 'Headmistress')
  const math = directory.groups.find((group) => group.id === 'math')

  assert.equal(headmistress.messageCount, 2)
  assert.equal(headmistress.fileCount, 1)
  assert.equal(headmistress.groupCount, 2)
  assert.equal(headmistress.latestTimestamp, '2026-08-03T10:00:00')
  assert.equal(math.participantCount, 2)
  assert.equal(math.linkCount, 1)
})

test('creates filterable person and group views', () => {
  const person = createProfileView(items, { type: 'person', id: 'Headmistress', name: 'Headmistress' })
  const group = createProfileView(items, { type: 'group', id: 'staff', name: 'Staff' })

  assert.equal(person.items.length, 3)
  assert.deepEqual(person.groups, ['Math', 'Staff'])
  assert.equal(filterProfileItems(person, 'files')[0].id, 'f1')
  assert.deepEqual(group.participants, ['Headmistress'])
})
