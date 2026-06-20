import type { ReactElement } from 'react'
import { Minimize2, PackageOpen, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FloatingActionButton } from '@/components/ui/FloatingActionButton'
import { Input } from '@/components/ui/input'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { HighlightText } from '../../traffic/ui/HighlightText'
import type { AdvancedSearchViewModel } from '../hooks/useAdvancedSearch'
import { advancedSearchTexts as t } from '../texts'
import type { AdvancedSearchGroup, AdvancedSearchMatch } from '../types'
import s from './AdvancedSearchPanelUI.module.css'

const ADVANCED_SEARCH_LAYOUT_ID = 'advanced-search-global-panels'
const ADVANCED_SEARCH_SPACER_ID = 'advanced-search-spacer'
const ADVANCED_SEARCH_PANEL_ID = 'advanced-search-panel'

export function AdvancedSearchPanelUI(p: AdvancedSearchViewModel): ReactElement {
  return (
    <div className={s.overlay} hidden={!p.isOpen} data-page-search-root>
      <ResizablePanelGroup
        id={ADVANCED_SEARCH_LAYOUT_ID}
        orientation="vertical"
        className={s.resizeGroup}
        hidden={p.isMinimized}
      >
        <ResizablePanel
          id={ADVANCED_SEARCH_SPACER_ID}
          defaultSize={68}
          minSize={30}
          className={s.spacer}
        />
        <ResizableHandle withHandle className={s.handle} />
        <ResizablePanel
          id={ADVANCED_SEARCH_PANEL_ID}
          defaultSize={32}
          minSize={18}
          className={s.panel}
        >
          <section className={s.shell} aria-label={t.title}>
            <header className={s.header}>
              <form
                className={s.searchForm}
                onSubmit={(event) => {
                  event.preventDefault()
                  p.submitSearch()
                }}
              >
                <Search className={s.searchIcon} aria-hidden />
                <Input
                  ref={p.inputRef}
                  type="search"
                  value={p.query}
                  onChange={(event) => p.setQuery(event.target.value)}
                  placeholder={t.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                  className={s.searchInput}
                />
                <Button
                  type="submit"
                  size="sm"
                  disabled={p.query.trim().length === 0 || p.isLoading}
                  className={s.searchButton}
                >
                  {t.searchButton}
                </Button>
              </form>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t.close}
                onClick={p.closeAdvancedSearch}
              >
                <X data-icon="inline-start" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t.minimize}
                onClick={p.minimizeAdvancedSearch}
              >
                <Minimize2 data-icon="inline-start" />
              </Button>
            </header>
            <div className={s.body}>
              {p.error ? (
                <p className={s.message}>{t.error(p.error)}</p>
              ) : (
                <SearchGroups
                  groups={p.groups}
                  hasSearched={p.hasSearched}
                  keywords={p.keywords}
                  onOpenMatch={(match) =>
                    p.openTarget({ entityType: match.entityType, id: match.id })
                  }
                />
              )}
            </div>
          </section>
        </ResizablePanel>
      </ResizablePanelGroup>
      <div className={s.minimizedButtonWrap} hidden={!p.isMinimized}>
        <FloatingActionButton
          aria-label={t.restore}
          title={t.restore}
          onClick={p.restoreAdvancedSearch}
          icon={<PackageOpen aria-hidden />}
        />
      </div>
    </div>
  )
}

function SearchGroups({
  groups,
  hasSearched,
  keywords,
  onOpenMatch,
}: {
  groups: AdvancedSearchGroup[]
  hasSearched: boolean
  keywords: string[]
  onOpenMatch: (match: AdvancedSearchMatch) => void
}): ReactElement {
  const visibleGroups = groups.filter((group) => group.matches.length > 0)

  if (!hasSearched) {
    return <p className={s.message}>{t.emptyQuery}</p>
  }

  if (visibleGroups.length === 0) {
    return <p className={s.message}>{t.noMatches}</p>
  }

  return (
    <div className={s.groups}>
      {visibleGroups.map((group) => (
        <section key={group.entityType} className={s.group}>
          <h3 className={s.groupTitle}>
            <span>{t.groupLabels[group.entityType]}</span>
            <span className={s.groupCount}>{group.matches.length}</span>
          </h3>
          <div className={s.matchList}>
            {group.matches.map((match, index) => (
              <button
                key={`${match.entityType}-${match.id}-${match.field}-${index}`}
                type="button"
                className={s.matchRow}
                aria-label={t.openResult(match.title)}
                onClick={() => onOpenMatch(match)}
              >
                <span className={s.matchMeta}>
                  <span className={s.matchTitle}>{match.title}</span>
                  <span className={s.matchField}>{match.field}</span>
                </span>
                <span className={s.matchSnippet}>
                  <HighlightText
                    text={match.snippet}
                    keywords={keywords}
                    markClassName={s.searchHighlight}
                  />
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
