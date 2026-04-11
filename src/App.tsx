import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AuthProvider } from './context/AuthContext';
import { AuthButton } from './components/common/AuthButton';
import './App.css'

// Lazy load the main component
const NotesList = lazy(() => import('./components/features/NotesList').then(module => ({ default: module.NotesList })));

function App() {
  return (
    <BrowserRouter basename="/DevNotes">
      <AuthProvider>
        <div className="app-container">
          <Header />
          <main className="app-main">
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route path="/" element={<NotesList />} />
                <Route path="/note/:noteId" element={<NotesList />} />
                <Route path="/qa" element={<NotesList />} />
                <Route path="/coding" element={<NotesList />} />
                <Route path="/blog" element={<NotesList />} />
                <Route path="*" element={<NotesList />} />
              </Routes>
            </Suspense>
          </main>
          <Footer />
        </div>
      </AuthProvider>
    </BrowserRouter>
  )
}

function Header() {
  const navigate = useNavigate();
  
  return (
    <header className="app-header">
      <div className="app-header-main">
        <div className="app-brand-row" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <span className="app-brand-badge" aria-hidden="true">DN</span>
          <h1>DevNotes</h1>
        </div>
        <p>Your coding notes, organized</p>
      </div>
      <AuthButton />
    </header>
  );
}

function LoadingFallback() {
  return (
    <div className="loading-container" style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      minHeight: '400px',
      fontSize: '1.1rem',
      color: 'var(--text-secondary, #6b7280)'
    }}>
      Loading...
    </div>
  );
}

function Footer() {
  return (

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
  );
}

export default App
