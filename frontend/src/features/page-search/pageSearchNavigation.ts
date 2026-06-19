import {
  PAGE_SEARCH_ACTIVE_HIGHLIGHT_NAME,
  type HighlightApi,
} from './pageSearchHighlight'

export type PageSearchSource = {
  id: string
  getMatchCount: (query: string) => number
  activateMatch: (query: string, index: number) => void
}

export function setHighlightRanges(api: HighlightApi, name: string, ranges: Range[]) {
  const highlight = new api.Highlight()
  ranges.forEach((range) => {
    highlight.add(range)
  })
  api.highlights.set(name, highlight)
}

export function clearActiveHighlight(api: HighlightApi | null) {
  api?.highlights.delete(PAGE_SEARCH_ACTIVE_HIGHLIGHT_NAME)
}

export function getSourceMatchCount(
  sources: ReadonlyMap<string, PageSearchSource>,
  query: string,
): number {
  if (!query) return 0

  return Array.from(sources.values()).reduce(
    (totalCount, source) => totalCount + source.getMatchCount(query),
    0,
  )
}

export function activateSourceMatch(args: {
  query: string
  sources: ReadonlyMap<string, PageSearchSource>
  sourceMatchIndex: number
}) {
  let skippedMatchCount = 0

  for (const source of args.sources.values()) {
    const matchCount = source.getMatchCount(args.query)
    const nextSkippedMatchCount = skippedMatchCount + matchCount

    if (args.sourceMatchIndex < nextSkippedMatchCount) {
      source.activateMatch(args.query, args.sourceMatchIndex - skippedMatchCount)
      return
    }

    skippedMatchCount = nextSkippedMatchCount
  }
}

export function scrollRangeIntoView(range: Range) {
  const element =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement

  element?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' })
}
