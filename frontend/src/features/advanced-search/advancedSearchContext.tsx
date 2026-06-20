import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import { usePageSearchContext } from '../page-search/pageSearchContext'
import {
  useAdvancedSearch,
  type AdvancedSearchViewModel,
} from './hooks/useAdvancedSearch'

const AdvancedSearchContext = createContext<AdvancedSearchViewModel | null>(null)

export function AdvancedSearchProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const pageSearch = usePageSearchContext()
  const viewModel = useAdvancedSearch({ onOpen: pageSearch.hideSearchBox })

  return (
    <AdvancedSearchContext.Provider value={viewModel}>
      {children}
    </AdvancedSearchContext.Provider>
  )
}

export function useAdvancedSearchContext(): AdvancedSearchViewModel {
  const viewModel = useContext(AdvancedSearchContext)

  if (!viewModel) {
    throw new Error('useAdvancedSearchContext must be used within AdvancedSearchProvider')
  }

  return viewModel
}
