import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import {
  PAGE_SEARCH_ACTIVE_HIGHLIGHT_NAME,
  type HighlightApi,
} from '../pageSearchHighlight'
import {
  activateSourceMatch,
  clearActiveHighlight,
  getSourceMatchCount,
  scrollRangeIntoView,
  setHighlightRanges,
  type PageSearchSource,
} from '../pageSearchNavigation'
import { usePageSearchDomHighlights } from './usePageSearchDomHighlights'

export type PageSearchViewModel = {
  query: string
  setQuery: (query: string) => void
  matchCount: number
  activeMatchNumber: number | null
  isSupported: boolean
  isVisible: boolean
  canNavigateSearchResults: boolean
  goToPreviousMatch: () => void
  goToNextMatch: () => void
  closeSearch: () => void
  registerSearchSource: (source: PageSearchSource) => () => void
  inputRef: RefObject<HTMLInputElement | null>
  searchRootRef: RefObject<HTMLDivElement | null>
}

export function usePageSearch(): PageSearchViewModel {
  const inputRef = useRef<HTMLInputElement>(null)
  const searchRootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const [domMatchCount, setDomMatchCount] = useState(0)
  const [activeMatchIndex, setActiveMatchIndex] = useState<number | null>(null)
  const [isSupported, setIsSupported] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [focusRequestId, setFocusRequestId] = useState(0)
  const [searchSources, setSearchSources] = useState<ReadonlyMap<string, PageSearchSource>>(
    () => new Map(),
  )
  const highlightApiRef = useRef<HighlightApi | null>(null)
  const domRangesRef = useRef<Range[]>([])
  const searchSourcesRef = useRef<ReadonlyMap<string, PageSearchSource>>(searchSources)

  const normalizedQuery = query.trim()
  const sourceMatchCount = useMemo(
    () => getSourceMatchCount(searchSources, normalizedQuery),
    [normalizedQuery, searchSources],
  )
  const totalMatchCount = domMatchCount + sourceMatchCount
  const canNavigateSearchResults = isVisible && totalMatchCount > 0

  useEffect(() => {
    searchSourcesRef.current = searchSources
  }, [searchSources])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.key.toLowerCase() !== 'f') {
        return
      }

      event.preventDefault()
      setIsVisible(true)
      setFocusRequestId((currentId) => currentId + 1)
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  useEffect(() => {
    if (!isVisible) {
      return
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })

    return () => {
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [focusRequestId, isVisible])

  const clearActiveMatchIndex = useCallback(() => {
    setActiveMatchIndex(null)
  }, [])

  usePageSearchDomHighlights({
    isVisible,
    normalizedQuery,
    searchRootRef,
    domRangesRef,
    highlightApiRef,
    setDomMatchCount,
    clearActiveMatchIndex,
    setIsSupported,
  })

  useEffect(() => {
    setActiveMatchIndex(null)
  }, [normalizedQuery])

  useEffect(() => {
    if (activeMatchIndex === null) {
      clearActiveHighlight(highlightApiRef.current)
      return
    }

    if (totalMatchCount === 0) {
      setActiveMatchIndex(null)
      clearActiveHighlight(highlightApiRef.current)
      return
    }

    if (activeMatchIndex >= totalMatchCount) {
      setActiveMatchIndex(totalMatchCount - 1)
    }
  }, [activeMatchIndex, totalMatchCount])

  const activateMatch = useCallback(
    (nextMatchIndex: number) => {
      const highlightApi = highlightApiRef.current
      if (!normalizedQuery) return

      const latestTotalMatchCount =
        domRangesRef.current.length +
        getSourceMatchCount(searchSourcesRef.current, normalizedQuery)
      if (latestTotalMatchCount === 0) return

      const normalizedMatchIndex =
        ((nextMatchIndex % latestTotalMatchCount) + latestTotalMatchCount) %
        latestTotalMatchCount
      const domRanges = domRangesRef.current

      setActiveMatchIndex(normalizedMatchIndex)

      if (normalizedMatchIndex < domRanges.length) {
        const range = domRanges[normalizedMatchIndex]
        if (!range) return
        if (highlightApi) {
          setHighlightRanges(highlightApi, PAGE_SEARCH_ACTIVE_HIGHLIGHT_NAME, [range])
        }
        scrollRangeIntoView(range)
        return
      }

      clearActiveHighlight(highlightApi)
      activateSourceMatch({
        query: normalizedQuery,
        sources: searchSourcesRef.current,
        sourceMatchIndex: normalizedMatchIndex - domRanges.length,
      })
    },
    [normalizedQuery],
  )

  const goToPreviousMatch = useCallback(() => {
    activateMatch(activeMatchIndex === null ? totalMatchCount - 1 : activeMatchIndex - 1)
  }, [activateMatch, activeMatchIndex, totalMatchCount])

  const goToNextMatch = useCallback(() => {
    activateMatch(activeMatchIndex === null ? 0 : activeMatchIndex + 1)
  }, [activateMatch, activeMatchIndex])

  const registerSearchSource = useCallback((source: PageSearchSource) => {
    setSearchSources((currentSources) => {
      const nextSources = new Map(currentSources)
      nextSources.set(source.id, source)
      return nextSources
    })

    return () => {
      setSearchSources((currentSources) => {
        const nextSources = new Map(currentSources)
        nextSources.delete(source.id)
        return nextSources
      })
    }
  }, [])

  const closeSearch = () => {
    setIsVisible(false)
    setQuery('')
    setActiveMatchIndex(null)
  }

  return {
    query,
    setQuery,
    matchCount: totalMatchCount,
    activeMatchNumber: activeMatchIndex === null ? null : activeMatchIndex + 1,
    isSupported,
    isVisible,
    canNavigateSearchResults,
    goToPreviousMatch,
    goToNextMatch,
    closeSearch,
    registerSearchSource,
    inputRef,
    searchRootRef,
  }
}
