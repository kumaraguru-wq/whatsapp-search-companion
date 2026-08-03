const features = [
  ['Import safely', 'Choose a WhatsApp .txt or .zip export from your device.'],
  ['Search quickly', 'Find messages, people, links, PDFs, documents and images.'],
  ['Stay private', 'Your imported conversations remain on this device.'],
]

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2 4.5 5v6.4c0 4.7 3.1 8.9 7.5 10.6 4.4-1.7 7.5-5.9 7.5-10.6V5L12 2Zm3.5 8.2-4.1 4.2a1 1 0 0 1-1.4 0l-1.8-1.8 1.4-1.4 1.1 1.1 3.4-3.5 1.4 1.4Z" />
    </svg>
  )
}

function App() {
  return (
    <main>
      <nav className="topbar" aria-label="Primary navigation">
        <a className="brand" href="./" aria-label="ChatFind home">
          <span className="brand-mark"><ShieldIcon /></span>
          <span>ChatFind</span>
        </a>
        <span className="privacy-pill">Local only</span>
      </nav>

      <section className="hero">
        <div className="eyebrow">Private WhatsApp search companion</div>
        <h1>Find the message you remember, even when you forgot the words.</h1>
        <p className="hero-copy">
          Import an exported conversation and search it on your device. No
          account, no server and no uploaded chat history.
        </p>
        <div className="actions">
          <button type="button" disabled title="Available after the parser is added on Day 2">
            Import a chat
          </button>
          <span>Importing arrives on Day 2</span>
        </div>
      </section>

      <section className="feature-grid" aria-label="Key features">
        {features.map(([title, description], index) => (
          <article key={title}>
            <span className="feature-number">0{index + 1}</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </article>
        ))}
      </section>

      <footer>
        <span>Day 1 foundation</span>
        <span className="dot" aria-hidden="true" />
        <span>Offline-ready PWA</span>
      </footer>
    </main>
  )
}

export default App

