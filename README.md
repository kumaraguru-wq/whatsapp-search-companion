# ChatFind

ChatFind is an installable, local-only PWA for importing and searching exported
WhatsApp conversations. Chat data stays in the user's browser and is not sent to
a server.

## Current capabilities

- Import Android and iPhone WhatsApp `.txt` exports.
- Open `.zip` exports and match included attachments to their messages.
- Recognize senders, dates, multiline messages, links and system messages.
- Preview participants, recent messages and extracted files without uploading them.
- Persist chats, messages and attachments in IndexedDB on the current device.
- Skip duplicate messages and files when the same export is imported again.
- Search locally with typo-tolerant keywords and sender, chat, date and type filters.
- See the latest message date covered by every saved chat export in the local library.
- Browse local person and group profiles with separate message, file, and link views.
- Star individual messages, files, images, and links for persistent local Quick Access.
- Download and restore a password-encrypted local backup containing chats, files, and stars.
- Open stored search-result files and distinguish media that WhatsApp omitted from an export.
- Browse category tabs and open the original message with nearby conversation context.
- Open available file and link results by selecting their title; context remains a separate action.

ChatFind requests persistent browser storage where supported, but encrypted
downloadable backups are still planned for Day 8.

## Import a chat

On WhatsApp, open a chat, choose **Export chat**, then save either the text-only
export or the ZIP with media. Open ChatFind and select that exported file. A ZIP
must contain the WhatsApp transcript as a `.txt` file.

## Local development

Install Node.js 22 LTS, then run:

```powershell
npm install
npm run dev
```

Create a production build with:

```powershell
npm run build
npm run preview
```

The service worker is disabled during Vite development and enabled in a
production build.

## GitHub Pages

The included GitHub Actions workflow builds and deploys the `main` branch.
After pushing the repository, open **Settings > Pages** and set the source to
**GitHub Actions**.

## Privacy boundary

GitHub Pages hosts only the application files. Imported conversations will be
stored locally in IndexedDB beginning with Day 3 and must never be committed to
the repository.
