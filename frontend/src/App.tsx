import { Suspense } from 'react'
import './App.css'
import { DashboardPortal } from './features/dashboard/portal'
import root from './features/dashboard/ui/DashboardUI.module.css'
import { FloatingTrafficPortal } from './features/floating-traffic/portal'

function App() {
  const view = new URLSearchParams(window.location.search).get('view')

  return (
    <Suspense fallback={<div className={root.app} />}>
      {view === 'floating-traffic' ? <FloatingTrafficPortal /> : <DashboardPortal />}
    </Suspense>
  )
}

export default App
