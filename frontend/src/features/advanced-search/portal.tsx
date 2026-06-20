import type { ReactElement } from 'react'
import { usePageSearchContext } from '../page-search/pageSearchContext'
import { useAdvancedSearchContext } from './advancedSearchContext'
import { AdvancedSearchPanelUI } from './ui/AdvancedSearchPanelUI'

export function AdvancedSearchPortal(): ReactElement {
  const viewModel = useAdvancedSearchContext()
  const pageSearch = usePageSearchContext()

  return (
    <AdvancedSearchPanelUI
      {...viewModel}
      closeAdvancedSearch={() => {
        viewModel.closeAdvancedSearch()
        const nextQuery = viewModel.query.trim() || pageSearch.query.trim()
        if (nextQuery) {
          pageSearch.showSearchBox(nextQuery)
        }
      }}
      submitSearch={() => {
        pageSearch.highlightQuery(viewModel.query.trim())
        viewModel.submitSearch()
      }}
    />
  )
}
