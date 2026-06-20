import { Suspense } from 'react'
import { ConfirmModalHost } from './components/ui/confirm-modal'
import { Toaster } from './components/ui/sonner'
import { AdvancedSearchProvider } from './features/advanced-search/advancedSearchContext'
import { AdvancedSearchPortal } from './features/advanced-search/portal'
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
        <AdvancedSearchProvider>
          {view === 'floating-traffic' ? <FloatingTrafficPortal /> : <DashboardPortal />}
          <AdvancedSearchPortal />
          <PageSearchPortal />
          <ConfirmModalHost />
          <Toaster position="bottom-right" />
        </AdvancedSearchProvider>
      </PageSearchProvider>
    </Suspense>
  )
}

export default App
