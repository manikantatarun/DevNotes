import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Note: StrictMode removed to prevent duplicate API calls in development
// StrictMode intentionally double-invokes effects, causing duplicate network requests
createRoot(document.getElementById('root')!).render(
  <App />
)
