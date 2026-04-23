import { Suspense } from 'react'
import './App.css'
import { DashboardPortal } from './features/dashboard/portal'
import root from './features/dashboard/ui/DashboardUI.module.css'

function App() {
  return (
    <Suspense fallback={<div className={root.app} />}>
      <DashboardPortal />
    </Suspense>
  )
}

export default App
