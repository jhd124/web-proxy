import type { ReactElement } from 'react'
import { ChevronLeft, ChevronRight, PackageOpen, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SimpleTooltip } from '@/components/ui/tooltip'
import { advancedSearchTexts } from '../../advanced-search/texts'
import type { PageSearchViewModel } from '../hooks/usePageSearch'
import { pageSearchTexts } from '../texts'
import root from './PageSearchUI.module.css'

type PageSearchUIProps = PageSearchViewModel & {
  onAdvancedSearchClick: () => void
}

export function PageSearchUI(p: PageSearchUIProps): ReactElement {
  const normalizedQuery = p.query.trim()
  const statusText = getStatusText({
    isSupported: p.isSupported,
    matchCount: p.matchCount,
    activeMatchNumber: p.activeMatchNumber,
  })

  return (
    <div
      ref={p.searchRootRef}
      className={root.container}
      hidden={!p.isSearchBoxVisible}
      data-page-search-root
    >
      <label className="sr-only" htmlFor="page-search-input">
        {pageSearchTexts.label}
      </label>
      <div className={root.inputShell}>
        <Search className={root.icon} aria-hidden="true" />
        <Input
          ref={p.inputRef}
          id="page-search-input"
          className={root.input}
          type="search"
          value={p.query}
          autoComplete="off"
          placeholder={pageSearchTexts.placeholder}
          onChange={(event) => {
            p.setQuery(event.target.value)
          }}
        />
        <div className={root.controlGroup}>
          <SimpleTooltip label={advancedSearchTexts.buttonTooltip}>
            <Button
              className={root.iconButton}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={advancedSearchTexts.buttonAriaLabel}
              onClick={p.onAdvancedSearchClick}
            >
              <PackageOpen data-icon="inline-start" />
            </Button>
          </SimpleTooltip>
          <Button
            className={root.iconButton}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={pageSearchTexts.previousLabel}
            disabled={!p.canNavigateSearchResults}
            onClick={p.goToPreviousMatch}
          >
            <ChevronLeft data-icon="inline-start" />
          </Button>
          <Button
            className={root.iconButton}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={pageSearchTexts.nextLabel}
            disabled={!p.canNavigateSearchResults}
            onClick={p.goToNextMatch}
          >
            <ChevronRight data-icon="inline-start" />
          </Button>
          <Button
            className={root.iconButton}
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={pageSearchTexts.closeLabel}
            onClick={p.closeSearch}
          >
            <X data-icon="inline-start" />
          </Button>
        </div>
      </div>
      {normalizedQuery && (
        <div className={root.status} aria-live="polite">
          {statusText}
        </div>
      )}
    </div>
  )
}

function getStatusText(args: {
  isSupported: boolean
  matchCount: number
  activeMatchNumber: number | null
}): string {
  if (!args.isSupported && args.matchCount === 0) {
    return pageSearchTexts.unsupported
  }

  if (args.matchCount === 0) {
    return pageSearchTexts.noMatches
  }

  if (args.activeMatchNumber !== null) {
    return `${args.activeMatchNumber} / ${args.matchCount}`
  }

  return `${args.matchCount} ${pageSearchTexts.matchUnit}`
}
