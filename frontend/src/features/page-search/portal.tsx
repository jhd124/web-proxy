import type { ReactElement } from 'react'
import { useAdvancedSearchContext } from '../advanced-search/advancedSearchContext'
import { usePageSearchContext } from './pageSearchContext'
import { PageSearchUI } from './ui/PageSearchUI'

export function PageSearchPortal(): ReactElement {
  const viewModel = usePageSearchContext()
  const advancedSearch = useAdvancedSearchContext()

  return (
    <PageSearchUI
      {...viewModel}
      onAdvancedSearchClick={() => {
        viewModel.hideSearchBox()
        advancedSearch.openAdvancedSearch({ query: viewModel.query })
      }}
    />
  )
}
