# ChatFind

ChatFind is an installable, local-only PWA for importing and searching exported
WhatsApp conversations. Chat data stays in the user's browser and is not sent to
a server.

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

