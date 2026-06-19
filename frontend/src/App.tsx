import { Suspense } from 'react'
import { ConfirmModalHost } from './components/ui/confirm-modal'
import { Toaster } from './components/ui/sonner'
import { DashboardPortal } from './features/dashboard/portal'
import root from './features/dashboard/ui/DashboardUI.module.css'
import { FloatingTrafficPortal } from './features/floating-traffic/portal'
import { PageSearchProvider } from './features/page-search/pageSearchContext'
import { PageSearchPortal } from './features/page-search/portal'

function App() {
  const view = new URLSearchParams(window.location.search).get('view')

  return (
    <Suspense fallback={<div className={root.app} />}>
      <PageSearchProvider>
        {view === 'floating-traffic' ? <FloatingTrafficPortal /> : <DashboardPortal />}
        <PageSearchPortal />
        <ConfirmModalHost />
        <Toaster position="bottom-right" />
      </PageSearchProvider>
    </Suspense>
  )
}

export default App
