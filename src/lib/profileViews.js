const FILE_KINDS = new Set(['pdf', 'document', 'excel', 'image', 'audio', 'video', 'other'])

function newestTimestamp(items) {
  return items.reduce((latest, item) => {
    if (!item.timestamp) return latest
    return !latest || item.timestamp > latest ? item.timestamp : latest
  }, null)
}

function addItemToSummary(summary, item) {
  if (item.kind === 'chat') summary.messageCount += 1
  if (FILE_KINDS.has(item.kind)) summary.fileCount += 1
  if (item.kind === 'link') summary.linkCount += 1
  if (item.timestamp && (!summary.latestTimestamp || item.timestamp > summary.latestTimestamp)) {
    summary.latestTimestamp = item.timestamp
  }
}

function emptySummary() {
  return { messageCount: 0, fileCount: 0, linkCount: 0, latestTimestamp: null }
}

export function createProfileDirectory(items) {
  const peopleByName = new Map()
  const groupsById = new Map()

  for (const item of items) {
    if (!groupsById.has(item.chatId)) {
      groupsById.set(item.chatId, {
        id: item.chatId,
        name: item.chatName,
        participants: new Set(),
        ...emptySummary(),
      })
    }
    const group = groupsById.get(item.chatId)
    if (item.sender) group.participants.add(item.sender)
    addItemToSummary(group, item)

    if (!item.sender) continue
    if (!peopleByName.has(item.sender)) {
      peopleByName.set(item.sender, {
        id: item.sender,
        name: item.sender,
        groups: new Set(),
        ...emptySummary(),
      })
    }
    const person = peopleByName.get(item.sender)
    person.groups.add(item.chatId)
    addItemToSummary(person, item)
  }

  const people = [...peopleByName.values()].map(({ groups, ...person }) => ({
    ...person,
    groupCount: groups.size,
  })).sort((left, right) => left.name.localeCompare(right.name))

  const groups = [...groupsById.values()].map(({ participants, ...group }) => ({
    ...group,
    participantCount: participants.size,
  })).sort((left, right) => left.name.localeCompare(right.name))

  return { people, groups }
}

export function createProfileView(items, selection) {
  const matchingItems = selection.type === 'person'
    ? items.filter((item) => item.sender === selection.id)
    : items.filter((item) => item.chatId === selection.id)
  const messages = matchingItems.filter((item) => item.kind === 'chat')
  const files = matchingItems.filter((item) => FILE_KINDS.has(item.kind))
  const links = matchingItems.filter((item) => item.kind === 'link')

  return {
    ...selection,
    items: matchingItems,
    messages,
    files,
    links,
    groups: [...new Set(matchingItems.map((item) => item.chatName).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    ),
    participants: [...new Set(matchingItems.map((item) => item.sender).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b),
    ),
    latestTimestamp: newestTimestamp(matchingItems),
  }
}

export function filterProfileItems(profile, tab) {
  if (tab === 'messages') return profile.messages
  if (tab === 'files') return profile.files
  if (tab === 'links') return profile.links
  return profile.items
}
