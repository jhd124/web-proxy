import type { ReactElement } from 'react'
import { usePageSearchContext } from './pageSearchContext'
import { PageSearchUI } from './ui/PageSearchUI'

export function PageSearchPortal(): ReactElement {
  const viewModel = usePageSearchContext()
  return <PageSearchUI {...viewModel} />
}
