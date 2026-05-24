import { Suspense } from 'react'
import './App.css'
import { Toaster } from './components/ui/sonner'
import { DashboardPortal } from './features/dashboard/portal'
import root from './features/dashboard/ui/DashboardUI.module.css'
import { FloatingTrafficPortal } from './features/floating-traffic/portal'

function App() {
  const view = new URLSearchParams(window.location.search).get('view')

  return (
    <Suspense fallback={<div className={root.app} />}>
      {view === 'floating-traffic' ? <FloatingTrafficPortal /> : <DashboardPortal />}
      <Toaster position="bottom-right" />
    </Suspense>
  )
}

export default App
