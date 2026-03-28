import { AuthProvider } from './context/AuthContext';
import { AuthButton } from './components/common/AuthButton';
import { NotesList } from './components/features';
import './App.css'

function App() {
  return (
    <AuthProvider>
      <div className="app-container">
        <header className="app-header">
          <div className="app-header-main">
            <div className="app-brand-row">
              <span className="app-brand-badge" aria-hidden="true">DN</span>
              <h1>DevNotes</h1>
            </div>
            <p>Your coding notes, organized</p>
          </div>
          <AuthButton />
        </header>

        <main className="app-main">
          <NotesList />
        </main>

        <footer className="app-footer">
          <div className="app-footer-brand">DevNotes • by Manikanta Tarun</div>
          <p className="app-footer-title">Built for focused interview preparation and daily engineering notes.</p>
          <p className="app-footer-subtitle">
            Keep questions, solutions, and learning notes in one searchable place.
          </p>
          <div className="app-footer-links">
            <a href="https://github.com/manikantatarun/DevNotes" target="_blank" rel="noopener noreferrer">
              View Source
            </a>
            <span aria-hidden="true">•</span>
            <a href="https://manikantatarun.github.io/DevNotes" target="_blank" rel="noopener noreferrer">
              Live App
            </a>
          </div>
        </footer>
      </div>
    </AuthProvider>
  )
}

export default App
