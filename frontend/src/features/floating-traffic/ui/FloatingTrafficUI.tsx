import { Input } from '@/components/ui/input'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { SimpleTooltip } from '@/components/ui/tooltip'
import { Trash } from 'lucide-react'
import { TrafficVirtualListUI } from '../../traffic/ui/TrafficVirtualListUI'
import { floatingTrafficTexts as t } from '../texts'
import type { FloatingTrafficViewModel } from '../types'
import { FloatingTrafficDetailPanelUI } from './FloatingTrafficDetailPanelUI'
import s from './FloatingTrafficUI.module.css'

export function FloatingTrafficUI({
  urlFilter,
  setUrlFilter,
  clearTraffic,
  filteredEntries,
  selectedId,
  selected,
  setSelectedId,
  openMainWindowForEntry,
}: FloatingTrafficViewModel) {
  const hasDetail = selected != null

  return (
    <section className={s.panel}>
      <header className={s.header}>
        <div>
          <Input
            type="search"
            value={urlFilter}
            onChange={(event) => setUrlFilter(event.target.value)}
            placeholder={t.filterPlaceholder}
            autoComplete="off"
            spellCheck={false}
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
              selectedId={selectedId}
              onSelect={setSelectedId}
              onEntryDoubleClick={(id) => void openMainWindowForEntry(id)}
              emptyText={t.empty}
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
            <ResizableHandle withHandle className="h-1.5 shrink-0 bg-border/90" />
            <ResizablePanel className="min-h-0" defaultSize={38} minSize={12}>
              <FloatingTrafficDetailPanelUI entry={selected} />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </section>
  )
}
