import { NotesList } from './components/features'
import './App.css'

function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <h1>📝 DevNotes</h1>
        <p>Your coding notes, organized</p>
      </header>
      
      <main className="app-main">
        <NotesList />
      </main>
      
      <footer className="app-footer">
        <p>
          Built with React + TypeScript + Vite | 
          <a href="https://github.com/manikantatarun/DevNotes" target="_blank" rel="noopener noreferrer">
            {' '}GitHub
          </a>
        </p>
      </footer>
    </div>
  )
}

export default App
