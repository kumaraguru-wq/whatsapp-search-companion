import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { importWhatsAppFile, releaseImport } from './lib/importWhatsApp.js'
import {
  clearLocalLibrary,
  getStorageEstimate,
  getStoredAttachment,
  getSavedState,
  exportLocalSnapshot,
  listStoredChats,
  loadMessageContext,
  loadSearchCorpus,
  loadStoredChat,
  requestPersistentStorage,
  restoreLocalSnapshot,
  saveImportedChat,
  toggleBookmarkedItem,
} from './lib/localDatabase.js'
import { createEncryptedBackup, openEncryptedBackup } from './lib/encryptedBackup.js'
import { inferMimeType } from './lib/whatsappParser.js'
import {
  createProfileDirectory,
  createProfileView,
  filterProfileItems,
} from './lib/profileViews.js'
import {
  createSearchItems,
  getSearchOptions,
  SEARCH_TYPES,
  searchItems,
} from './lib/searchEngine.js'

const EMPTY_SEARCH_FILTERS = {
  query: '',
  sender: 'all',
  group: 'all',
  type: 'all',
  fromDate: '',
  toDate: '',
}

const RESULT_TABS = [
  { value: 'all', label: 'All' },
  { value: 'chat', label: 'Chats' },
  { value: 'pdf', label: 'PDFs' },
  { value: 'document', label: 'Documents' },
  { value: 'excel', label: 'Excel' },
  { value: 'link', label: 'Links' },
  { value: 'image', label: 'Images' },
]

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 4.5 5v6.4c0 4.7 3.1 8.9 7.5 10.6 4.4-1.7 7.5-5.9 7.5-10.6V5L12 2Zm3.5 8.2-4.1 4.2a1 1 0 0 1-1.4 0l-1.8-1.8 1.4-1.4 1.1 1.1 3.4-3.5 1.4 1.4Z" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 16V7.8L8.4 10.4 7 9l5-5 5 5-1.4 1.4L13 7.8V16h-2Zm-5 4a2 2 0 0 1-2-2v-3h2v3h12v-3h2v3a2 2 0 0 1-2 2H6Z" />
    </svg>
  )
}

function StarIcon({ filled = false }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={filled
        ? 'm12 2.8 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.5 6.3-.9L12 2.8Z'
        : 'm12 5.5 1.9 3.9.3.6.7.1 4.3.6-3.1 3-.5.5.1.7.8 4.2-3.8-2-.6-.3-.6.3-3.8 2 .8-4.2.1-.7-.5-.5-3.1-3 4.3-.6.7-.1.3-.6L12 5.5Zm0-3.2 3.5 7.1 7.8 1.1-5.7 5.5 1.3 7.7-6.9-3.6-6.9 3.6L6.4 16 .7 10.5l7.8-1.1L12 2.3Z'} />
    </svg>
  )
}

function ThemeIcon({ theme }) {
  return theme === 'dark' ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 9 9c0-.5 0-1-.1-1.5a7 7 0 0 1-7.4-7.4C13 3 12.5 3 12 3Z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5h1v3h-2V2h1Zm0 17h1v3h-2v-3h1ZM2 11h3v2H2v-2Zm17 0h3v2h-3v-2ZM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1Zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1Zm2.1-13.5 1.4 1.4-2.1 2.1-1.4-1.4 2.1-2.1ZM6.3 16.3l1.4 1.4-2.1 2.1-1.4-1.4 2.1-2.1Z" />
    </svg>
  )
}

function isIosDevice() {
  return /iphone|ipad|ipod/iu.test(navigator.userAgent) || (
    navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1
  )
}

function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isDismissed, setIsDismissed] = useState(false)
  const [showIosSteps, setShowIosSteps] = useState(false)
  const isIos = typeof navigator !== 'undefined' && isIosDevice()

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
    setIsInstalled(standalone)

    function handleInstallAvailable(event) {
      event.preventDefault()
      setInstallEvent(event)
    }
    function handleInstalled() {
      setIsInstalled(true)
      setInstallEvent(null)
    }
    window.addEventListener('beforeinstallprompt', handleInstallAvailable)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallAvailable)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [])

  if (isInstalled || isDismissed || (!installEvent && !isIos)) return null

  async function handleInstall() {
    if (isIos) {
      setShowIosSteps(true)
      return
    }
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') setIsInstalled(true)
    setInstallEvent(null)
  }

  return (
    <aside className="install-banner" aria-label="Install ChatFind">
      <span className="install-icon" aria-hidden="true"><ShieldIcon /></span>
      <div>
        <strong>Install ChatFind on this device</strong>
        <p>{isIos ? 'Add it to your iPhone Home Screen for quick offline access.' : 'Use it like an app and open saved chats offline.'}</p>
        {showIosSteps && (
          <p className="ios-install-steps">
            In Safari, tap the Share button, then choose <strong>Add to Home Screen</strong>.
          </p>
        )}
      </div>
      <button className="install-action" type="button" onClick={handleInstall}>
        {isIos ? 'Show steps' : 'Install app'}
      </button>
      <button className="install-dismiss" type="button" aria-label="Dismiss install suggestion" onClick={() => setIsDismissed(true)}>×</button>
    </aside>
  )
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`
}

function displayTime(message) {
  return message.timestamp?.replace('T', ' ') ?? `${message.dateText}, ${message.timeText}`
}

function formatChatCoverageDate(timestamp) {
  if (!timestamp) return 'Date unavailable'
  const [year, month, day] = timestamp.slice(0, 10).split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function ImportPanel({ onImported, importedChat }) {
  const inputRef = useRef(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file) {
    if (!file) return
    setError('')
    setIsLoading(true)

    try {
      const result = await importWhatsAppFile(file)
      try {
        await onImported(result)
      } catch (saveError) {
        releaseImport(result)
        throw saveError
      }
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : 'The chat could not be imported.')
    } finally {
      setIsLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  function handleDrop(event) {
    event.preventDefault()
    setIsDragging(false)
    handleFile(event.dataTransfer.files?.[0])
  }

  return (
    <section className="import-section" aria-labelledby="import-heading">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Local import</span>
          <h2 id="import-heading">Bring in a conversation</h2>
        </div>
        <p>Nothing leaves this browser.</p>
      </div>

      <div
        className={`drop-zone${isDragging ? ' is-dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          setIsDragging(true)
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <span className="upload-icon"><UploadIcon /></span>
        <div>
          <h3>{isLoading ? 'Reading your export…' : 'Drop a WhatsApp export here'}</h3>
          <p>Choose one .txt file or a .zip export containing media, up to 300 MB.</p>
        </div>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={isLoading}>
          {isLoading ? 'Importing…' : importedChat ? 'Choose another' : 'Choose export'}
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept=".txt,.zip,text/plain,application/zip,application/x-zip-compressed"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
      </div>

      {error && <p className="error-message" role="alert">{error}</p>}
    </section>
  )
}

function SavedChats({ chats, storageEstimate, onOpen, isOpening }) {
  if (chats.length === 0) return null

  return (
    <section className="library-section" aria-labelledby="library-heading">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Saved on this device</span>
          <h2 id="library-heading">Your chat library</h2>
        </div>
        {storageEstimate && (
          <p>{formatBytes(storageEstimate.usage)} used locally</p>
        )}
      </div>
      <div className="chat-library">
        {chats.map((chat) => (
            <article className="chat-library-card" key={chat.id}>
              <button className="chat-card-open" type="button" onClick={() => onOpen(chat.id)} disabled={isOpening}>
                <span className="chat-initial" aria-hidden="true">
                  {chat.name.trim().charAt(0).toUpperCase() || 'C'}
                </span>
                <span className="chat-card-copy">
                  <strong>{chat.name}</strong>
                  <small>{chat.messageCount} messages · {chat.attachmentCount} files</small>
                  <small className="chat-coverage">
                    Chat available up to {formatChatCoverageDate(chat.latestMessageAt)}
                  </small>
                </span>
                <time>Updated {new Date(chat.updatedAt).toLocaleDateString()}</time>
              </button>
            </article>
        ))}
      </div>
    </section>
  )
}

function QuickAccess({ chats, items, bookmarkedItemIds, onOpenResult, onViewContext, onToggleBookmark }) {
  const starredItems = items.filter((item) => bookmarkedItemIds.has(item.id))
  if (chats.length === 0) return null

  return (
    <section className="quick-access-section" aria-labelledby="quick-access-heading">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Saved shortcuts</span>
          <h2 id="quick-access-heading">Quick access</h2>
        </div>
        <p>Stars stay on this device.</p>
      </div>

      {starredItems.length === 0 ? (
        <div className="quick-access-empty">
          <StarIcon />
          <p>Star a search result to keep important school information here.</p>
        </div>
      ) : (
          <div className="quick-access-column starred-only">
            <h3>Starred items <span>{starredItems.length}</span></h3>
            {starredItems.map((item) => (
              <article className="quick-item" key={item.id}>
                <button type="button" onClick={() => item.kind === 'chat' || !item.available ? onViewContext(item) : onOpenResult(item)}>
                  <span className={`result-kind kind-${item.kind}`}>{item.kind}</span>
                  <span><strong>{item.kind === 'chat' ? (item.content || 'Message') : item.title}</strong><small>{item.chatName}{item.sender ? ` · ${item.sender}` : ''}</small></span>
                </button>
                <button className="star-control is-starred" type="button" aria-label={`Remove star from ${item.title}`} onClick={() => onToggleBookmark(item.id)}>
                  <StarIcon filled />
                </button>
              </article>
            ))}
          </div>
      )}
    </section>
  )
}

function BackupRestoreSection({ onRestored, onClear }) {
  const [backupPassword, setBackupPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [restoreFile, setRestoreFile] = useState(null)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [backupStatus, setBackupStatus] = useState('')
  const [restoreStatus, setRestoreStatus] = useState('')
  const [error, setError] = useState('')

  async function handleBackup(event) {
    event.preventDefault()
    setError('')
    setBackupStatus('')
    if (backupPassword !== confirmPassword) {
      setError('The two backup passwords do not match.')
      return
    }
    setIsBackingUp(true)
    try {
      const snapshot = await exportLocalSnapshot()
      if (snapshot.chats.length === 0) throw new Error('Import at least one chat before creating a backup.')
      const blob = await createEncryptedBackup(snapshot, backupPassword)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `chatfind-backup-${new Date().toISOString().slice(0, 10)}.chatfind-backup`
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      setBackupStatus(`Encrypted backup downloaded · ${formatBytes(blob.size)}`)
      setBackupPassword('')
      setConfirmPassword('')
    } catch (backupError) {
      setError(backupError instanceof Error ? backupError.message : 'The encrypted backup could not be created.')
    } finally {
      setIsBackingUp(false)
    }
  }

  async function handleRestore(event) {
    event.preventDefault()
    const form = event.currentTarget
    setError('')
    setRestoreStatus('')
    if (!restoreFile) {
      setError('Choose a ChatFind backup file to restore.')
      return
    }
    setIsRestoring(true)
    try {
      const snapshot = await openEncryptedBackup(restoreFile, restorePassword)
      const report = await restoreLocalSnapshot(snapshot)
      await requestPersistentStorage().catch(() => false)
      await onRestored()
      setRestoreStatus(
        `Restored ${report.chats} chats, ${report.messages} messages, ${report.attachments} files and ${report.bookmarks} stars.`,
      )
      setRestorePassword('')
      setRestoreFile(null)
      form.reset()
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : 'The backup could not be restored.')
    } finally {
      setIsRestoring(false)
    }
  }

  async function handleClear() {
    setError('')
    setIsClearing(true)
    try {
      await onClear()
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'Local chat history could not be cleared.')
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <section className="backup-section" aria-labelledby="backup-heading">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Protect your library</span>
          <h2 id="backup-heading">Encrypted backup &amp; restore</h2>
        </div>
        <p>Your password never leaves this device.</p>
      </div>

      <div className="backup-grid">
        <form className="backup-card" onSubmit={handleBackup}>
          <span className="backup-number">01</span>
          <div>
            <h3>Download a protected copy</h3>
            <p>Includes every local chat, message, attachment and starred item.</p>
          </div>
          <label>
            <span>Backup password</span>
            <input
              type="password"
              value={backupPassword}
              minLength="8"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              onChange={(event) => setBackupPassword(event.target.value)}
              required
            />
          </label>
          <label>
            <span>Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              minLength="8"
              autoComplete="new-password"
              placeholder="Type it again"
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={isBackingUp}>
            {isBackingUp ? 'Encrypting backup…' : 'Download encrypted backup'}
          </button>
          {backupStatus && <p className="backup-success" role="status">{backupStatus}</p>}
        </form>

        <form className="backup-card" onSubmit={handleRestore}>
          <span className="backup-number">02</span>
          <div>
            <h3>Restore on this device</h3>
            <p>Merges the backup safely with chats already stored in this browser.</p>
          </div>
          <label className="backup-file-picker">
            <span>Backup file</span>
            <input
              type="file"
              accept=".chatfind-backup,application/octet-stream"
              onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)}
              required
            />
          </label>
          <label>
            <span>Backup password</span>
            <input
              type="password"
              value={restorePassword}
              minLength="8"
              autoComplete="current-password"
              placeholder="Password used for backup"
              onChange={(event) => setRestorePassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={isRestoring}>
            {isRestoring ? 'Decrypting and restoring…' : 'Restore encrypted backup'}
          </button>
          {restoreStatus && <p className="backup-success" role="status">{restoreStatus}</p>}
        </form>
      </div>

      <div className="clear-history-card">
        <div>
          <strong>Clear local chat history</strong>
          <p>Deletes all imported chats, included files and stars from this browser only.</p>
        </div>
        <button type="button" onClick={handleClear} disabled={isClearing}>
          {isClearing ? 'Clearing…' : 'Clear all local data'}
        </button>
      </div>

      {error && <p className="error-message backup-error" role="alert">{error}</p>}
      <p className="backup-warning">
        Keep the downloaded file and password separately. ChatFind cannot recover a forgotten password.
      </p>
    </section>
  )
}

function PeopleGroupsDirectory({ directory, onOpenPerson, onOpenGroup }) {
  if (directory.people.length === 0 && directory.groups.length === 0) return null

  return (
    <section className="directory-section" aria-labelledby="directory-heading">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Browse your archive</span>
          <h2 id="directory-heading">People &amp; groups</h2>
        </div>
        <p>Open a profile to see everything shared.</p>
      </div>

      <div className="directory-columns">
        <div className="directory-column">
          <div className="directory-title-row">
            <h3>People</h3>
            <span>{directory.people.length}</span>
          </div>
          <div className="directory-list">
            {directory.people.map((person) => (
              <button key={person.id} type="button" onClick={() => onOpenPerson(person.name)}>
                <span className="directory-avatar" aria-hidden="true">
                  {person.name.trim().charAt(0).toUpperCase() || 'P'}
                </span>
                <span>
                  <strong>{person.name}</strong>
                  <small>{person.messageCount} messages · {person.fileCount} files · {person.groupCount} chats</small>
                </span>
                <span className="directory-arrow" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </div>

        <div className="directory-column">
          <div className="directory-title-row">
            <h3>Groups</h3>
            <span>{directory.groups.length}</span>
          </div>
          <div className="directory-list">
            {directory.groups.map((group) => (
              <button key={group.id} type="button" onClick={() => onOpenGroup(group.id, group.name)}>
                <span className="directory-avatar group-avatar" aria-hidden="true">
                  {group.name.trim().charAt(0).toUpperCase() || 'G'}
                </span>
                <span>
                  <strong>{group.name}</strong>
                  <small>{group.participantCount} people · {group.fileCount} files · {group.linkCount} links</small>
                </span>
                <span className="directory-arrow" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

function SearchSection({
  items,
  filters,
  onFiltersChange,
  onOpenResult,
  onViewContext,
  onOpenPerson,
  onOpenGroup,
  bookmarkedItemIds,
  onToggleBookmark,
}) {
  const options = useMemo(() => getSearchOptions(items), [items])
  const hasCriteria = Boolean(
    filters.query.trim() ||
      filters.sender !== 'all' ||
      filters.group !== 'all' ||
      filters.type !== 'all' ||
      filters.fromDate ||
      filters.toDate,
  )
  const baseResults = useMemo(
    () => (hasCriteria
      ? searchItems(items, { ...filters, type: 'all', limit: Math.max(items.length, 1) })
      : []),
    [filters, hasCriteria, items],
  )
  const tabCounts = useMemo(() => {
    const counts = { all: baseResults.length }
    for (const result of baseResults) counts[result.kind] = (counts[result.kind] ?? 0) + 1
    return counts
  }, [baseResults])
  const filteredResults = filters.type === 'all'
    ? baseResults
    : baseResults.filter((result) => result.kind === filters.type)
  const results = filteredResults.slice(0, 60)

  function updateFilter(name, value) {
    onFiltersChange((current) => ({ ...current, [name]: value }))
  }

  return (
    <section className="search-section" aria-labelledby="search-heading">
      <div className="section-heading">
        <div>
          <span className="section-kicker">Local search</span>
          <h2 id="search-heading">Find anything you remember</h2>
        </div>
        <p>Typos and partial names are okay.</p>
      </div>

      <div className="search-shell">
        <label className="search-box">
          <span className="visually-hidden">Search saved chats</span>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m20.7 19.3-4.2-4.2a7.5 7.5 0 1 0-1.4 1.4l4.2 4.2 1.4-1.4ZM5 10.5a5.5 5.5 0 1 1 11 0 5.5 5.5 0 0 1-11 0Z" />
          </svg>
          <input
            type="search"
            value={filters.query}
            onChange={(event) => updateFilter('query', event.target.value)}
            placeholder="Try “Headmistress PDF” or “exam timetable”"
            disabled={items.length === 0}
          />
          {hasCriteria && (
            <button type="button" onClick={() => onFiltersChange({ ...EMPTY_SEARCH_FILTERS })}>
              Clear
            </button>
          )}
        </label>

        <div className="search-filters">
          <label>
            <span>Sender</span>
            <select value={filters.sender} onChange={(event) => updateFilter('sender', event.target.value)}>
              <option value="all">All senders</option>
              {options.senders.map((sender) => <option key={sender} value={sender}>{sender}</option>)}
            </select>
          </label>
          <label>
            <span>Group</span>
            <select value={filters.group} onChange={(event) => updateFilter('group', event.target.value)}>
              <option value="all">All chats</option>
              {options.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </label>
          <label>
            <span>Type</span>
            <select value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}>
              {SEARCH_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
            </select>
          </label>
          <label>
            <span>From</span>
            <input type="date" value={filters.fromDate} onChange={(event) => updateFilter('fromDate', event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={filters.toDate} onChange={(event) => updateFilter('toDate', event.target.value)} />
          </label>
        </div>
      </div>

      {items.length === 0 && <p className="search-empty">Import a chat to begin searching.</p>}
      {hasCriteria && items.length > 0 && (
        <div className="search-results" aria-live="polite">
          <div className="result-tabs" role="tablist" aria-label="Search result categories">
            {RESULT_TABS.map((tab) => (
              <button
                className={filters.type === tab.value ? 'is-active' : ''}
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={filters.type === tab.value}
                onClick={() => updateFilter('type', tab.value)}
              >
                {tab.label}<span>{tabCounts[tab.value] ?? 0}</span>
              </button>
            ))}
          </div>
          <div className="search-result-count">
            <strong>{filteredResults.length}</strong>{' '}
            {filteredResults.length === 1 ? 'result' : 'results'}
            {filteredResults.length > 60 && ' (showing the first 60)'}
          </div>
          {results.length === 0 ? (
            <p className="search-empty">No saved item matches those words and filters.</p>
          ) : (
            <div className="day-four-results">
              {results.map((result) => (
                <article className="search-result-card" key={result.id}>
                  <span className={`result-kind kind-${result.kind}`}>{result.kind}</span>
                  <div className="result-main">
                    <button
                      className="result-copy"
                      type="button"
                      aria-label={
                        result.kind === 'chat' || !result.available
                          ? `View context for ${result.title}`
                          : `Open ${result.title}`
                      }
                      onClick={() => (
                        result.kind === 'chat' || !result.available
                          ? onViewContext(result)
                          : onOpenResult(result)
                      )}
                    >
                      <h3>{result.title}</h3>
                      <p>{result.content || result.title}</p>
                    </button>
                    <span className="result-profile-links">
                      <button type="button" onClick={() => onOpenGroup(result.chatId, result.chatName)}>
                        {result.chatName}
                      </button>
                      {result.sender && (
                        <>
                          <span aria-hidden="true">·</span>
                          <button type="button" onClick={() => onOpenPerson(result.sender)}>
                            {result.sender}
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                  <span className="result-tail">
                    <time>{result.timestamp?.slice(0, 10) ?? result.dateText}</time>
                    <button
                      className={`star-control${bookmarkedItemIds.has(result.id) ? ' is-starred' : ''}`}
                      type="button"
                      aria-label={`${bookmarkedItemIds.has(result.id) ? 'Remove star from' : 'Star'} ${result.title}`}
                      aria-pressed={bookmarkedItemIds.has(result.id)}
                      onClick={() => onToggleBookmark(result.id)}
                    >
                      <StarIcon filled={bookmarkedItemIds.has(result.id)} />
                    </button>
                    {!result.available ? (
                      <small className="unavailable-result">Not included in export</small>
                    ) : result.messageId ? (
                      <button type="button" onClick={() => onViewContext(result)}>
                        View context
                      </button>
                    ) : (
                      <small>Tap the name to open</small>
                    )}
                  </span>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function MessageContextViewer({ context, onClose, onOpenAttachment }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      className="context-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="context-panel" role="dialog" aria-modal="true" aria-labelledby="context-heading">
        <header>
          <div>
            <span className="section-kicker">Original conversation</span>
            <h2 id="context-heading">{context.chatName}</h2>
          </div>
          <button className="context-close" type="button" onClick={onClose} aria-label="Close message context">
            ×
          </button>
        </header>

        <div className="context-messages">
          {context.messages.map((message) => (
            <article
              className={message.id === context.selectedMessageId ? 'is-selected' : ''}
              key={message.id}
            >
              <div className="message-meta">
                <strong>{message.sender ?? 'WhatsApp system'}</strong>
                <time>{displayTime(message)}</time>
              </div>
              <p>{message.content || 'Attachment'}</p>
              {(message.attachments ?? []).map((attachment) => (
                <button
                  className="context-attachment"
                  key={attachment.id}
                  type="button"
                  onClick={() => onOpenAttachment(attachment.id)}
                >
                  Open {attachment.name}
                </button>
              ))}
              {(message.links ?? []).map((link) => (
                <a className="context-link" key={link} href={link} target="_blank" rel="noreferrer">
                  Open link
                </a>
              ))}
            </article>
          ))}
        </div>

        <footer>
          The highlighted message is the matching result. Nearby messages provide context.
        </footer>
      </section>
    </div>
  )
}

const PROFILE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'messages', label: 'Messages' },
  { value: 'files', label: 'Files' },
  { value: 'links', label: 'Links' },
]

function ProfileViewer({
  profile,
  onClose,
  onOpenResult,
  onViewContext,
  onOpenPerson,
  onOpenGroup,
  bookmarkedItemIds,
  onToggleBookmark,
}) {
  const [tab, setTab] = useState('all')

  useEffect(() => setTab('all'), [profile.id, profile.type])
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const tabCounts = {
    all: profile.items.length,
    messages: profile.messages.length,
    files: profile.files.length,
    links: profile.links.length,
  }
  const visibleItems = [...filterProfileItems(profile, tab)]
    .sort((left, right) => (right.timestamp ?? '').localeCompare(left.timestamp ?? ''))
    .slice(0, 100)

  return (
    <div
      className="profile-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="profile-panel" role="dialog" aria-modal="true" aria-labelledby="profile-heading">
        <header className="profile-header">
          <div className={`profile-hero-avatar ${profile.type === 'group' ? 'group-avatar' : ''}`} aria-hidden="true">
            {profile.name.trim().charAt(0).toUpperCase() || 'C'}
          </div>
          <div className="profile-heading-copy">
            <span className="section-kicker">{profile.type === 'person' ? 'Person profile' : 'Group view'}</span>
            <h2 id="profile-heading">{profile.name}</h2>
            <p>
              {profile.messages.length} messages · {profile.files.length} files · {profile.links.length} links
              {profile.latestTimestamp && ` · through ${formatChatCoverageDate(profile.latestTimestamp)}`}
            </p>
          </div>
          <button className="context-close" type="button" onClick={onClose} aria-label="Close profile">×</button>
        </header>

        <div className="profile-related">
          <strong>{profile.type === 'person' ? 'Appears in' : 'Participants'}</strong>
          <div>
            {profile.type === 'person'
              ? profile.groups.map((groupName) => {
                const groupItem = profile.items.find((item) => item.chatName === groupName)
                return (
                  <button key={groupName} type="button" onClick={() => onOpenGroup(groupItem.chatId, groupName)}>
                    {groupName}
                  </button>
                )
              })
              : profile.participants.map((participant) => (
                <button key={participant} type="button" onClick={() => onOpenPerson(participant)}>
                  {participant}
                </button>
              ))}
          </div>
        </div>

        <div className="profile-tabs" role="tablist" aria-label="Profile categories">
          {PROFILE_TABS.map((profileTab) => (
            <button
              className={tab === profileTab.value ? 'is-active' : ''}
              key={profileTab.value}
              type="button"
              role="tab"
              aria-selected={tab === profileTab.value}
              onClick={() => setTab(profileTab.value)}
            >
              {profileTab.label}<span>{tabCounts[profileTab.value]}</span>
            </button>
          ))}
        </div>

        <div className="profile-items">
          {visibleItems.length === 0 ? (
            <p className="profile-empty">Nothing has been shared in this category.</p>
          ) : visibleItems.map((item) => (
            <article key={item.id}>
              <span className={`result-kind kind-${item.kind}`}>{item.kind}</span>
              <button
                type="button"
                onClick={() => (
                  item.kind === 'chat' || !item.available
                    ? onViewContext(item)
                    : onOpenResult(item)
                )}
              >
                <strong>{item.kind === 'chat' ? (item.content || 'Message') : item.title}</strong>
                {item.kind !== 'chat' && <small>{item.content || item.chatName}</small>}
              </button>
              <span className="profile-item-actions">
                <button
                  className={`star-control${bookmarkedItemIds.has(item.id) ? ' is-starred' : ''}`}
                  type="button"
                  aria-label={`${bookmarkedItemIds.has(item.id) ? 'Remove star from' : 'Star'} ${item.title}`}
                  aria-pressed={bookmarkedItemIds.has(item.id)}
                  onClick={() => onToggleBookmark(item.id)}
                >
                  <StarIcon filled={bookmarkedItemIds.has(item.id)} />
                </button>
                <span className="profile-item-meta">
                  <time>{item.timestamp?.slice(0, 10) ?? item.dateText}</time>
                  {profile.type === 'person' ? item.chatName : (item.sender || 'WhatsApp system')}
                </span>
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function ImportPreview({ chat, importReport }) {
  const linkCount = chat.messages.reduce((total, message) => total + message.links.length, 0)
  const recentMessages = chat.messages.slice(-12)

  return (
    <section className="preview-section" aria-labelledby="preview-heading">
      <div className="preview-title-row">
        <div>
          <span className="section-kicker">Import preview</span>
          <h2 id="preview-heading">{chat.chatName}</h2>
          <p>{chat.sourceName}</p>
        </div>
        <span className="parsed-badge">Parsed successfully</span>
      </div>

      {importReport && (
        <div className="save-report" role="status">
          <strong>Saved on this device</strong>
          <span>
            {importReport.addedMessages} new messages · {importReport.duplicateMessages} duplicates skipped
            {' · '}{importReport.addedAttachments} new files
          </span>
        </div>
      )}

      <div className="summary-grid">
        <div><strong>{chat.messages.length.toLocaleString()}</strong><span>messages</span></div>
        <div><strong>{chat.participants.length.toLocaleString()}</strong><span>people</span></div>
        <div><strong>{chat.attachments.length.toLocaleString()}</strong><span>files</span></div>
        <div><strong>{linkCount.toLocaleString()}</strong><span>links</span></div>
      </div>

      <div className="preview-columns">
        <aside>
          <h3>Participants</h3>
          <div className="participant-list">
            {chat.participants.length > 0 ? chat.participants.map((participant) => (
              <span key={participant}>{participant}</span>
            )) : <p>No named senders found.</p>}
          </div>

          {chat.attachments.length > 0 && (
            <div className="file-summary">
              <h3>Extracted files</h3>
              {chat.attachments.slice(0, 8).map((attachment) => (
                <a key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer">
                  <span>{attachment.name}</span>
                  <small>{attachment.category} · {formatBytes(attachment.size)}</small>
                </a>
              ))}
              {chat.attachments.length > 8 && <p>+{chat.attachments.length - 8} more files</p>}
            </div>
          )}
        </aside>

        <div className="message-preview">
          <div className="message-preview-heading">
            <h3>Latest messages</h3>
            <span>Showing {recentMessages.length} of {chat.messages.length}</span>
          </div>
          <div className="message-list">
            {recentMessages.map((message) => (
              <article className={message.kind === 'system' ? 'system-message' : ''} key={message.id}>
                <div className="message-meta">
                  <strong>{message.sender ?? 'WhatsApp system'}</strong>
                  <time>{displayTime(message)}</time>
                </div>
                <p>{message.content || 'Attachment'}</p>
                {message.attachments.map((attachment) => (
                  <a className="attachment-chip" key={attachment.id} href={attachment.url} target="_blank" rel="noreferrer">
                    {attachment.name}
                  </a>
                ))}
              </article>
            ))}
          </div>
        </div>
      </div>

      <p className="storage-note">
        Stored only in this browser using IndexedDB. Re-import this chat anytime to add new messages.
      </p>
    </section>
  )
}

function App() {
  const [theme, setTheme] = useState(() => {
    try {
      const savedTheme = localStorage.getItem('chatfind-theme')
      if (savedTheme === 'light' || savedTheme === 'dark') return savedTheme
    } catch {
      // Continue with the device preference when local storage is unavailable.
    }
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  })
  const [importedChat, setImportedChat] = useState(null)
  const [importReport, setImportReport] = useState(null)
  const [storedChats, setStoredChats] = useState([])
  const [storageEstimate, setStorageEstimate] = useState(null)
  const [libraryError, setLibraryError] = useState('')
  const [isOpening, setIsOpening] = useState(false)
  const [searchIndex, setSearchIndex] = useState([])
  const [searchFilters, setSearchFilters] = useState({ ...EMPTY_SEARCH_FILTERS })
  const [messageContext, setMessageContext] = useState(null)
  const [isContextLoading, setIsContextLoading] = useState(false)
  const [profileSelection, setProfileSelection] = useState(null)
  const [bookmarkedItemIds, setBookmarkedItemIds] = useState(() => new Set())
  const profileDirectory = useMemo(() => createProfileDirectory(searchIndex), [searchIndex])
  const activeProfile = useMemo(
    () => (profileSelection ? createProfileView(searchIndex, profileSelection) : null),
    [profileSelection, searchIndex],
  )

  useEffect(() => () => releaseImport(importedChat), [importedChat])
  useEffect(() => () => releaseImport(messageContext), [messageContext])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'light' ? '#f4f1e8' : '#07110f',
    )
    try {
      localStorage.setItem('chatfind-theme', theme)
    } catch {
      // The selected theme still works for this session.
    }
  }, [theme])

  const refreshLibrary = useCallback(async () => {
    const [chats, estimate, corpus, savedState] = await Promise.all([
      listStoredChats(),
      getStorageEstimate(),
      loadSearchCorpus(),
      getSavedState(),
    ])
    setStoredChats(chats)
    setStorageEstimate(estimate)
    setSearchIndex(createSearchItems(corpus))
    setBookmarkedItemIds(new Set(savedState.bookmarkedItemIds))
  }, [])

  useEffect(() => {
    refreshLibrary().catch((error) => {
      setLibraryError(error instanceof Error ? error.message : 'Saved chats could not be opened.')
    })
  }, [refreshLibrary])

  async function handleImported(nextChat) {
    const report = await saveImportedChat(nextChat)
    await requestPersistentStorage().catch(() => false)
    setImportedChat(nextChat)
    setImportReport(report)
    setLibraryError('')
    await refreshLibrary()
    window.requestAnimationFrame(() => {
      document.querySelector('.preview-section')?.scrollIntoView({ behavior: 'smooth' })
    })
  }

  async function handleOpenStoredChat(chatId) {
    setIsOpening(true)
    setLibraryError('')
    try {
      const chat = await loadStoredChat(chatId)
      setImportedChat(chat)
      setImportReport(null)
      window.requestAnimationFrame(() => {
        document.querySelector('.preview-section')?.scrollIntoView({ behavior: 'smooth' })
      })
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'That chat could not be opened.')
    } finally {
      setIsOpening(false)
    }
  }

  async function handleOpenSearchResult(result) {
    if (!result.available) return

    if (result.kind === 'link' && result.url) {
      window.open(result.url, '_blank', 'noopener,noreferrer')
      return
    }

    if (!result.attachmentId) {
      await handleOpenStoredChat(result.chatId)
      return
    }

    const newWindow = window.open('', '_blank')
    if (newWindow) newWindow.opener = null
    try {
      const attachment = await getStoredAttachment(result.attachmentId)
      const currentType = attachment.blob.type
      const desiredType = inferMimeType(attachment.name, currentType || 'application/octet-stream')
      const blob = currentType === desiredType
        ? attachment.blob
        : new Blob([attachment.blob], { type: desiredType })
      const url = URL.createObjectURL(blob)

      if (newWindow) {
        newWindow.location.href = url
      } else {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = attachment.name
        anchor.click()
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (error) {
      newWindow?.close()
      setLibraryError(error instanceof Error ? error.message : 'That file could not be opened.')
    }
  }

  async function handleViewContext(result) {
    if (!result.messageId) {
      if (result.available) await handleOpenSearchResult(result)
      return
    }

    setIsContextLoading(true)
    setLibraryError('')
    try {
      const context = await loadMessageContext(result.chatId, result.messageId, 2)
      setMessageContext(context)
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'Message context could not be opened.')
    } finally {
      setIsContextLoading(false)
    }
  }

  function handleOpenPerson(name) {
    setProfileSelection({ type: 'person', id: name, name })
  }

  function handleOpenGroup(id, name) {
    setProfileSelection({ type: 'group', id, name })
  }

  async function handleToggleBookmark(itemId) {
    try {
      const isStarred = await toggleBookmarkedItem(itemId)
      setBookmarkedItemIds((current) => {
        const next = new Set(current)
        if (isStarred) next.add(itemId)
        else next.delete(itemId)
        return next
      })
    } catch (error) {
      setLibraryError(error instanceof Error ? error.message : 'That item could not be starred.')
    }
  }

  async function handleClearLocalHistory() {
    const confirmed = window.confirm(
      'Delete every imported chat, included file and starred item from this browser? Download an encrypted backup first if you may need this data later.',
    )
    if (!confirmed) return
    await clearLocalLibrary()
    releaseImport(importedChat)
    releaseImport(messageContext)
    setImportedChat(null)
    setImportReport(null)
    setMessageContext(null)
    setProfileSelection(null)
    setSearchFilters({ ...EMPTY_SEARCH_FILTERS })
    setLibraryError('')
    await refreshLibrary()
  }

  return (
    <main>
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="./" aria-label="ChatFind home">
          <span className="brand-mark"><ShieldIcon /></span>
          <span>ChatFind</span>
        </a>
        <div className="nav-actions">
          <a className="help-link" href="./help.html" target="_blank" rel="noreferrer">Help</a>
          <button
            className="theme-toggle"
            type="button"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
          >
            <ThemeIcon theme={theme} />
            <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
          </button>
          <span className="privacy-pill">Local only</span>
        </div>
      </nav>

      <section className="hero compact-hero">
        <div className="eyebrow">Private WhatsApp search companion</div>
        <h1>Turn an old conversation into something you can find.</h1>
        <p className="hero-copy">
          Import an Android or iPhone WhatsApp export. ChatFind reads messages,
          people, links and attached files directly on your device.
        </p>
      </section>

      <InstallPrompt />

      <SavedChats
        chats={storedChats}
        storageEstimate={storageEstimate}
        onOpen={handleOpenStoredChat}
        isOpening={isOpening}
      />
      {libraryError && <p className="error-message library-error" role="alert">{libraryError}</p>}
      <QuickAccess
        chats={storedChats}
        items={searchIndex}
        bookmarkedItemIds={bookmarkedItemIds}
        onOpenResult={handleOpenSearchResult}
        onViewContext={handleViewContext}
        onToggleBookmark={handleToggleBookmark}
      />
      <BackupRestoreSection onRestored={refreshLibrary} onClear={handleClearLocalHistory} />
      <PeopleGroupsDirectory
        directory={profileDirectory}
        onOpenPerson={handleOpenPerson}
        onOpenGroup={handleOpenGroup}
      />
      <SearchSection
        items={searchIndex}
        filters={searchFilters}
        onFiltersChange={setSearchFilters}
        onOpenResult={handleOpenSearchResult}
        onViewContext={handleViewContext}
        onOpenPerson={handleOpenPerson}
        onOpenGroup={handleOpenGroup}
        bookmarkedItemIds={bookmarkedItemIds}
        onToggleBookmark={handleToggleBookmark}
      />
      {isContextLoading && <p className="context-loading" role="status">Opening message context…</p>}
      <ImportPanel onImported={handleImported} importedChat={importedChat} />
      {importedChat && <ImportPreview chat={importedChat} importReport={importReport} />}

      {messageContext && (
        <MessageContextViewer
          context={messageContext}
          onClose={() => setMessageContext(null)}
          onOpenAttachment={(attachmentId) => handleOpenSearchResult({
            available: true,
            attachmentId,
          })}
        />
      )}

      {activeProfile && (
        <ProfileViewer
          profile={activeProfile}
          onClose={() => setProfileSelection(null)}
          onOpenResult={handleOpenSearchResult}
          onViewContext={(result) => {
            setProfileSelection(null)
            handleViewContext(result)
          }}
          onOpenPerson={handleOpenPerson}
          onOpenGroup={handleOpenGroup}
          bookmarkedItemIds={bookmarkedItemIds}
          onToggleBookmark={handleToggleBookmark}
        />
      )}

      <footer>
        <span>ChatFind v1.0</span>
        <span className="dot" aria-hidden="true" />
        <span>Offline-ready PWA</span>
      </footer>
    </main>
  )
}

export default App
