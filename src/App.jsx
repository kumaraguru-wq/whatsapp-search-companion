import { useEffect, useRef, useState } from 'react'
import { importWhatsAppFile, releaseImport } from './lib/importWhatsApp.js'

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
      onImported(result)
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

function ImportPreview({ chat }) {
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
        Preview only. Permanent on-device storage and duplicate detection arrive on Day 3.
      </p>
    </section>
  )
}

function App() {
  const [importedChat, setImportedChat] = useState(null)

  useEffect(() => () => releaseImport(importedChat), [importedChat])

  function handleImported(nextChat) {
    setImportedChat(nextChat)
    window.requestAnimationFrame(() => {
      document.querySelector('.preview-section')?.scrollIntoView({ behavior: 'smooth' })
    })
  }

  return (
    <main>
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="./" aria-label="ChatFind home">
          <span className="brand-mark"><ShieldIcon /></span>
          <span>ChatFind</span>
        </a>
        <span className="privacy-pill">Local only</span>
      </nav>

      <section className="hero compact-hero">
        <div className="eyebrow">Private WhatsApp search companion</div>
        <h1>Turn an old conversation into something you can find.</h1>
        <p className="hero-copy">
          Import an Android or iPhone WhatsApp export. ChatFind reads messages,
          people, links and attached files directly on your device.
        </p>
      </section>

      <ImportPanel onImported={handleImported} importedChat={importedChat} />
      {importedChat && <ImportPreview chat={importedChat} />}

      <footer>
        <span>Day 2 importer</span>
        <span className="dot" aria-hidden="true" />
        <span>Offline-ready PWA</span>
      </footer>
    </main>
  )
}

export default App
