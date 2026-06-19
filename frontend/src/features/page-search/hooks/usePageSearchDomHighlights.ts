import { useEffect, type MutableRefObject, type RefObject } from 'react'
import {
  attachPageSearchHighlightStyle,
  collectPageSearchRanges,
  getHighlightApi,
  PAGE_SEARCH_ACTIVE_HIGHLIGHT_NAME,
  PAGE_SEARCH_HIGHLIGHT_NAME,
  type HighlightApi,
} from '../pageSearchHighlight'
import { setHighlightRanges } from '../pageSearchNavigation'

type UsePageSearchDomHighlightsArgs = {
  isVisible: boolean
  normalizedQuery: string
  searchRootRef: RefObject<HTMLDivElement | null>
  domRangesRef: MutableRefObject<Range[]>
  highlightApiRef: MutableRefObject<HighlightApi | null>
  setDomMatchCount: (matchCount: number) => void
  clearActiveMatchIndex: () => void
  setIsSupported: (isSupported: boolean) => void
}

export function usePageSearchDomHighlights(args: UsePageSearchDomHighlightsArgs) {
  const {
    isVisible,
    normalizedQuery,
    searchRootRef,
    domRangesRef,
    highlightApiRef,
    setDomMatchCount,
    clearActiveMatchIndex,
    setIsSupported,
  } = args

  useEffect(() => {
    const highlightApi = getHighlightApi()
    highlightApiRef.current = highlightApi
    setIsSupported(Boolean(highlightApi))

    if (!highlightApi) {
      setDomMatchCount(0)
      domRangesRef.current = []
      return
    }

    if (!isVisible) {
      clearPageSearchHighlights(highlightApi)
      setDomMatchCount(0)
      domRangesRef.current = []
      return
    }

    const detachHighlightStyle = attachPageSearchHighlightStyle()

    const refreshHighlights = () => {
      clearPageSearchHighlights(highlightApi)

      if (!normalizedQuery) {
        setDomMatchCount(0)
        clearActiveMatchIndex()
        domRangesRef.current = []
        return
      }

      const ranges = collectPageSearchRanges({
        root: document.body,
        searchRoot: searchRootRef.current,
        query: normalizedQuery,
      })

      domRangesRef.current = ranges
      setHighlightRanges(highlightApi, PAGE_SEARCH_HIGHLIGHT_NAME, ranges)
      setDomMatchCount(ranges.length)
    }

    let animationFrameId: number | null = null
    const scheduleRefresh = () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
      }

      animationFrameId = window.requestAnimationFrame(refreshHighlights)
    }

    refreshHighlights()

    const observer = new MutationObserver(scheduleRefresh)
    observer.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId)
      }

      clearPageSearchHighlights(highlightApi)
      detachHighlightStyle()
    }
  }, [
    clearActiveMatchIndex,
    domRangesRef,
    highlightApiRef,
    isVisible,
    normalizedQuery,
    searchRootRef,
    setDomMatchCount,
    setIsSupported,
  ])
}

function clearPageSearchHighlights(highlightApi: HighlightApi) {
  highlightApi.highlights.delete(PAGE_SEARCH_HIGHLIGHT_NAME)
  highlightApi.highlights.delete(PAGE_SEARCH_ACTIVE_HIGHLIGHT_NAME)
}
