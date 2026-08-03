# ChatFind

ChatFind is an installable, local-only web app for importing and searching
exported WhatsApp conversations. Chats, files and passwords stay in the user's
browser; GitHub Pages hosts only the application code.

**Live application:** https://kumaraguru-wq.github.io/whatsapp-search-companion/

**Teacher instructions:** [TEACHER_GUIDE.md](./TEACHER_GUIDE.md)

**Backup & restore:** https://kumaraguru-wq.github.io/whatsapp-search-companion/backup.html

## Version 1.0 features

- Import Android and iPhone WhatsApp TXT or ZIP exports.
- Extract included PDFs, documents, spreadsheets, links and images.
- Store conversations and attachments locally in IndexedDB.
- Re-import updated exports without duplicating existing messages or files.
- Search with typo-tolerant keywords and sender, group, date and file-type filters.
- Open files directly or view the matching message with nearby context.
- Browse person and group profiles with messages, files and links.
- Star important results for persistent local Quick Access.
- Download and restore password-encrypted backups containing chats, files and stars.
- Switch between remembered light and dark themes.
- Install as an offline-ready PWA on supported phones and computers.
- Open the teacher instructions on a separate Help page and clear all local history when required.

## Privacy and storage

Imported data is never uploaded by ChatFind. It remains in the current browser's
IndexedDB storage. Browser data can still be removed by the device or user, so
teachers should periodically download an encrypted backup and store the backup
file separately from its password.

Files missing from a WhatsApp export cannot be reconstructed. Download the file
inside WhatsApp, export the chat again with media, and re-import the updated ZIP.

## Local development

Install Node.js 22 LTS, then run:

```powershell
npm install
npm test
npm run dev
```

Create a production build with:

```powershell
npm run build
npm run preview
```

The service worker is disabled during Vite development and enabled in production.

## Deployment

The GitHub Actions workflow tests and builds every push to `main`, then deploys
the `dist` directory to GitHub Pages. Pages must use **GitHub Actions** as its
source in the repository settings.

## Release

Version 1.0 completes the planned local-only application and handover. The app
has no server, staff accounts, Firebase project or ongoing hosting fee.
