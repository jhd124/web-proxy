import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import { usePageSearch, type PageSearchViewModel } from './hooks/usePageSearch'

const PageSearchContext = createContext<PageSearchViewModel | null>(null)

export function PageSearchProvider({ children }: { children: ReactNode }): ReactElement {
  const viewModel = usePageSearch()

  return (
    <PageSearchContext.Provider value={viewModel}>{children}</PageSearchContext.Provider>
  )
}

export function usePageSearchContext(): PageSearchViewModel {
  const viewModel = useContext(PageSearchContext)

  if (!viewModel) {
    throw new Error('usePageSearchContext must be used within PageSearchProvider')
  }

  return viewModel
}
