import { useMemo } from 'react'
import { usePageSearchContext } from '../page-search/pageSearchContext'
import { TrafficPanelUI } from './ui/TrafficPanelUI'
import type { TrafficPanelUIProps } from './types'

export function TrafficPanelPortal(p: TrafficPanelUIProps) {
  const pageSearch = usePageSearchContext()
  const mergedSearchKeywords = useMemo(
    () => mergeSearchKeywords(p.searchKeywords, pageSearch.query, pageSearch.isVisible),
    [p.searchKeywords, pageSearch.query, pageSearch.isVisible],
  )

  return <TrafficPanelUI {...p} searchKeywords={mergedSearchKeywords} />
}

function mergeSearchKeywords(
  trafficKeywords: readonly string[],
  pageSearchQuery: string,
  isPageSearchVisible: boolean,
): readonly string[] {
  const normalizedPageSearchQuery = pageSearchQuery.trim()

  if (!isPageSearchVisible || !normalizedPageSearchQuery) {
    return trafficKeywords
  }

  return [...trafficKeywords, normalizedPageSearchQuery]
}
