import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createEncryptedBackup, openEncryptedBackup } from './lib/encryptedBackup.js'
import {
  exportLocalSnapshot,
  requestPersistentStorage,
  restoreLocalSnapshot,
} from './lib/localDatabase.js'
import './backupPage.css'

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** index
  return `${value.toFixed(index === 0 || value >= 10 ? 0 : 1)} ${units[index]}`
}

function notifyLibraryChanged() {
  if (!('BroadcastChannel' in window)) return
  const channel = new BroadcastChannel('chatfind-library')
  channel.postMessage({ type: 'library-changed' })
  channel.close()
}

function BackupPage() {
  const [backupPassword, setBackupPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [restoreFile, setRestoreFile] = useState(null)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
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
      notifyLibraryChanged()
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

  return (
    <main>
      <nav>
        <a className="brand" href="./"><span>C</span>ChatFind</a>
        <a className="back-link" href="./">← Back to app</a>
      </nav>

      <header>
        <span className="kicker">Protected local copy</span>
        <h1>Backup &amp; restore</h1>
        <p>Move your private ChatFind library safely without uploading it to a server.</p>
      </header>

      <section className="backup-grid">
        <form className="backup-card" onSubmit={handleBackup}>
          <span className="number">01</span>
          <div>
            <h2>Download a protected copy</h2>
            <p>Includes every local chat, message, attachment and starred item.</p>
          </div>
          <label>
            <span>Backup password</span>
            <input type="password" value={backupPassword} minLength="8" autoComplete="new-password" placeholder="At least 8 characters" onChange={(event) => setBackupPassword(event.target.value)} required />
          </label>
          <label>
            <span>Confirm password</span>
            <input type="password" value={confirmPassword} minLength="8" autoComplete="new-password" placeholder="Type it again" onChange={(event) => setConfirmPassword(event.target.value)} required />
          </label>
          <button type="submit" disabled={isBackingUp}>{isBackingUp ? 'Encrypting backup…' : 'Download encrypted backup'}</button>
          {backupStatus && <p className="success" role="status">{backupStatus}</p>}
        </form>

        <form className="backup-card" onSubmit={handleRestore}>
          <span className="number">02</span>
          <div>
            <h2>Restore on this device</h2>
            <p>Merges the backup safely with chats already stored in this browser.</p>
          </div>
          <label>
            <span>Backup file</span>
            <input type="file" accept=".chatfind-backup,application/octet-stream" onChange={(event) => setRestoreFile(event.target.files?.[0] ?? null)} required />
          </label>
          <label>
            <span>Backup password</span>
            <input type="password" value={restorePassword} minLength="8" autoComplete="current-password" placeholder="Password used for backup" onChange={(event) => setRestorePassword(event.target.value)} required />
          </label>
          <button type="submit" disabled={isRestoring}>{isRestoring ? 'Decrypting and restoring…' : 'Restore encrypted backup'}</button>
          {restoreStatus && <p className="success" role="status">{restoreStatus}</p>}
        </form>
      </section>

      {error && <p className="error" role="alert">{error}</p>}
      <aside><strong>Important:</strong> Keep the backup file and password separately. ChatFind cannot recover a forgotten password.</aside>
      <footer>ChatFind v1.0 · Encrypted locally on this device</footer>
    </main>
  )
}

createRoot(document.getElementById('backup-root')).render(<BackupPage />)
