export const PAGE_SEARCH_HIGHLIGHT_NAME = 'page-search-results'
export const PAGE_SEARCH_ACTIVE_HIGHLIGHT_NAME = 'page-search-active-result'
export const PAGE_SEARCH_ROOT_SELECTOR = '[data-page-search-root]'
export const PAGE_SEARCH_VIRTUAL_SOURCE_SELECTOR = '[data-page-search-virtual-source]'

const PAGE_SEARCH_STYLE_ELEMENT_ID = 'page-search-highlight-style'
const EXCLUDED_SELECTOR = [
  PAGE_SEARCH_ROOT_SELECTOR,
  PAGE_SEARCH_VIRTUAL_SOURCE_SELECTOR,
  'script',
  'style',
  'noscript',
  'input',
  'textarea',
  'select',
  '[aria-hidden="true"]',
].join(',')

type HighlightValue = {
  add: (range: Range) => void
}

type HighlightConstructor = new () => HighlightValue

type HighlightRegistry = {
  delete: (name: string) => boolean
  set: (name: string, highlight: HighlightValue) => void
}

export type HighlightApi = {
  Highlight: HighlightConstructor
  highlights: HighlightRegistry
}

export function collectPageSearchRanges(args: {
  root: HTMLElement
  searchRoot: HTMLElement | null
  query: string
}): Range[] {
  const ranges: Range[] = []
  const normalizedQuery = args.query.toLowerCase()
  const walker = document.createTreeWalker(args.root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => getTextNodeFilterResult(node, args.searchRoot),
  })

  let currentNode = walker.nextNode()

  while (currentNode) {
    const textNode = currentNode as Text
    const text = textNode.data
    const normalizedText = text.toLowerCase()
    let startIndex = normalizedText.indexOf(normalizedQuery)

    while (startIndex >= 0) {
      const range = document.createRange()
      range.setStart(textNode, startIndex)
      range.setEnd(textNode, startIndex + args.query.length)
      ranges.push(range)
      startIndex = normalizedText.indexOf(normalizedQuery, startIndex + args.query.length)
    }

    currentNode = walker.nextNode()
  }

  return ranges
}

export function getHighlightApi(): HighlightApi | null {
  const highlightConstructor = (window as Window & { Highlight?: HighlightConstructor }).Highlight
  const highlightRegistry = (CSS as typeof CSS & { highlights?: HighlightRegistry }).highlights

  if (!highlightConstructor || !highlightRegistry) {
    return null
  }

  return {
    Highlight: highlightConstructor,
    highlights: highlightRegistry,
  }
}

export function attachPageSearchHighlightStyle(): () => void {
  const existingStyleElement = document.getElementById(PAGE_SEARCH_STYLE_ELEMENT_ID)

  if (existingStyleElement) {
    return () => {}
  }

  const styleElement = document.createElement('style')
  styleElement.id = PAGE_SEARCH_STYLE_ELEMENT_ID
  styleElement.textContent = `
::highlight(${PAGE_SEARCH_HIGHLIGHT_NAME}) {
  background: var(--yellow-700);
  color: var(--gray-900);
}

::highlight(${PAGE_SEARCH_ACTIVE_HIGHLIGHT_NAME}) {
  background: var(--yellow-700);
  color: var(--gray-900);
  text-decoration: underline;
  text-decoration-color: var(--gray-900);
  text-decoration-thickness: 2px;
}
`
  document.head.append(styleElement)

  return () => {
    styleElement.remove()
  }
}

function getTextNodeFilterResult(node: Node, searchRoot: HTMLElement | null): number {
  const parentElement = node.parentElement

  if (!node.textContent?.trim() || !parentElement) {
    return NodeFilter.FILTER_REJECT
  }

  if (searchRoot?.contains(parentElement) || parentElement.closest(EXCLUDED_SELECTOR)) {
    return NodeFilter.FILTER_REJECT
  }

  if (!isVisibleElement(parentElement)) {
    return NodeFilter.FILTER_REJECT
  }

  return NodeFilter.FILTER_ACCEPT
}

function isVisibleElement(element: Element): boolean {
  const style = window.getComputedStyle(element)
  return style.display !== 'none' && style.visibility !== 'hidden'
}
