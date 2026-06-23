import { Input } from '@/components/ui/input'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { SimpleTooltip } from '@/components/ui/tooltip'
import { Trash, X } from 'lucide-react'
import { TrafficVirtualListUI } from '../../traffic/ui/TrafficVirtualListUI'
import { floatingTrafficTexts as t } from '../texts'
import type { FloatingTrafficViewModel } from '../types'
import { FloatingTrafficDetailPanelUI } from './FloatingTrafficDetailPanelUI'
import s from './FloatingTrafficUI.module.css'

const EMPTY_ID_SET: ReadonlySet<string> = new Set()
const EMPTY_ID_MAP: ReadonlyMap<string, string> = new Map()

export function FloatingTrafficUI({
  urlFilter,
  setUrlFilter,
  urlFilterTags,
  activeFilterKeywords,
  commitUrlFilterInputAsTag,
  removeUrlFilterTag,
  popUrlFilterTag,
  clearTraffic,
  filteredEntries,
  selectedId,
  selected,
  setSelectedId,
  openMainWindowForEntry,
}: FloatingTrafficViewModel) {
  const hasDetail = selectedId != null

  return (
    <section className={s.panel}>
      <header className={s.header}>
        <div className={s.filterBox}>
          {urlFilterTags.map((keyword) => (
            <button
              key={keyword}
              type="button"
              className={s.filterTag}
              onClick={() => removeUrlFilterTag(keyword)}
              aria-label={t.removeKeywordAriaLabel(keyword)}
            >
              <span className={s.filterTagLabel}>{keyword}</span>
              <X className={s.filterTagCloseIcon} />
            </button>
          ))}
          <Input
            type="search"
            value={urlFilter}
            onChange={(event) => setUrlFilter(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                commitUrlFilterInputAsTag()
                return
              }
              if (event.key !== 'Backspace') return
              if (urlFilter.trim().length > 0) return
              if (urlFilterTags.length === 0) return
              event.preventDefault()
              popUrlFilterTag()
            }}
            placeholder={t.filterPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className={s.input}
          />
        </div>
        <SimpleTooltip label={t.clear}>
          <button type="button" className="ghost" onClick={() => void clearTraffic()}>
            <Trash />
          </button>
        </SimpleTooltip>
      </header>

      <ResizablePanelGroup
        orientation="vertical"
        className={s.split}
        id="floating-traffic-panels"
      >
        <ResizablePanel
          className="min-h-0"
          defaultSize={hasDetail ? 62 : 100}
          minSize={15}
        >
          <div className={s.listPanel}>
            <TrafficVirtualListUI
              className={s.listScroll}
              entries={filteredEntries}
              matchedEntryIds={EMPTY_ID_SET}
              savedEntryIds={EMPTY_ID_SET}
              matchedOverrideByEntryId={EMPTY_ID_MAP}
              matchedBreakpointByEntryId={EMPTY_ID_MAP}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onCopyCurl={(id) => {
                void openMainWindowForEntry(id)
              }}
              onSaveRequest={(id) => openMainWindowForEntry(id)}
              onOpenSavedRequest={(id) => {
                void openMainWindowForEntry(id)
              }}
              onOverride={(id) => {
                void openMainWindowForEntry(id)
              }}
              onOpenMatchedOverride={(id) => {
                void openMainWindowForEntry(id)
              }}
              onAddBreakpoint={(id) => openMainWindowForEntry(id)}
              onOpenMatchedBreakpoint={(id) => {
                void openMainWindowForEntry(id)
              }}
              onEntryDoubleClick={(id) => void openMainWindowForEntry(id)}
              emptyText={t.empty}
              searchKeywords={activeFilterKeywords}
              tagTexts={{
                tagError: t.tagError,
                tagBypassed: t.tagBypassed,
                tagPending: t.tagPending,
              }}
            />
          </div>
        </ResizablePanel>

        {hasDetail && (
          <>
            <ResizableHandle withHandle className="h-1.5 shrink-0 bg-border/40" />
            <ResizablePanel className="min-h-0" defaultSize={38} minSize={12}>
              <FloatingTrafficDetailPanelUI
                entry={selected}
                searchKeywords={activeFilterKeywords}
              />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </section>
  )
}
