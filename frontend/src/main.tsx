import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isDesktopHost } from './lib/desktopHost'

if (isDesktopHost()) {
  document.documentElement.classList.add('is-desktop-host')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
