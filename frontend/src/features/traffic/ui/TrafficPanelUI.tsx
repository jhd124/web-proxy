import { copyTextToClipboard } from '@/lib/clipboard'
import { showSuccessToast, showToast } from '@/lib/toast'
import { X } from 'lucide-react'
import { trafficTexts as t } from '../texts'
import { getTrafficConnectDetailNote } from '../trafficDisplay'
import { TrafficVirtualListUI } from './TrafficVirtualListUI'
import type { TrafficPanelUIProps } from '../types'
import s from './TrafficPanelUI.module.css'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useDefaultLayout } from 'react-resizable-panels'
import { LEFT_LIST_PANEL_DEFAULT_SIZE } from '@/lib/panelLayout'
import { HeadersTable } from '@/components/headers-table/HeadersTable'

const TRAFFIC_LAYOUT_ID = 'traffic-panels-group'
const TRAFFIC_LIST_PANEL_ID = 'traffic-list'
const TRAFFIC_DETAIL_PANEL_ID = 'traffic-detail'

export function TrafficPanelUI({
  testError,
  filteredEntries,
  matchedTrafficEntryIds,
  savedTrafficEntryIds,
  matchedOverrideByEntryId,
  matchedBreakpointByEntryId,
  selectedId,
  setSelectedId,
  selected,
  selectedIsEventStream,
  onEntryCopyCurl,
  onEntrySaveRequest,
  onEntryOverride,
  onEntryAddBreakpoint,
  onEntryReplay,
  onEntryOpenSavedRequest,
  onEntryOpenMatchedOverride,
  onEntryOpenMatchedBreakpoint,
}: TrafficPanelUIProps) {
  // 通过库自带持久化按「当前面板集合」精确记忆并恢复分栏宽度，切换 tab 后保持不变。
  const panelIds = selected
    ? [TRAFFIC_LIST_PANEL_ID, TRAFFIC_DETAIL_PANEL_ID]
    : [TRAFFIC_LIST_PANEL_ID]
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: TRAFFIC_LAYOUT_ID,
    panelIds,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  })

  const handleCopyRequestUrl = () => {
    if (!selected) return
    void copyTextToClipboard(selected.url)
      .then(() => {
        showSuccessToast(t.copyUrlSuccess)
      })
      .catch((error) => {
        const detail = error instanceof Error ? error.message : String(error)
        showToast(t.copyUrlFailed(detail), 'error')
      })
  }

  return (
    <ResizablePanelGroup
      id={TRAFFIC_LAYOUT_ID}
      defaultLayout={defaultLayout}
      onLayoutChanged={onLayoutChanged}
    >
      <ResizablePanel
        defaultSize={LEFT_LIST_PANEL_DEFAULT_SIZE}
        minSize={16}
        id={TRAFFIC_LIST_PANEL_ID}
      >
        <aside className={s.listPanel}>
          {testError && <p className={`small err ${s.testErr}`}>{testError}</p>}
          <TrafficVirtualListUI
            className="min-h-0 flex-1"
            entries={filteredEntries}
            matchedEntryIds={matchedTrafficEntryIds}
            savedEntryIds={savedTrafficEntryIds}
            matchedOverrideByEntryId={matchedOverrideByEntryId}
            matchedBreakpointByEntryId={matchedBreakpointByEntryId}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCopyCurl={onEntryCopyCurl}
            onSaveRequest={onEntrySaveRequest}
            onOverride={onEntryOverride}
            onAddBreakpoint={onEntryAddBreakpoint}
            onReplay={onEntryReplay}
            onOpenSavedRequest={onEntryOpenSavedRequest}
            onOpenMatchedOverride={onEntryOpenMatchedOverride}
            onOpenMatchedBreakpoint={onEntryOpenMatchedBreakpoint}
          />
        </aside>
      </ResizablePanel>
      {selected && (
        <>
          <ResizableHandle withHandle className="w-1.5 shrink-0 bg-border/90" />
          <ResizablePanel
            className="min-h-0 min-w-0"
            minSize={28}
            defaultSize={38}
            id={TRAFFIC_DETAIL_PANEL_ID}
          >
            <main className={s.detail}>
              <section className={s.block}>
                <div className={s.blockHead}>
                  <h2>{t.sectionRequest}</h2>
                  <div className={s.detailActions}>
                    <X  onClick={() => setSelectedId(null)} className='cursor-pointer'/>
                  </div>
                </div>
                <button
                  type="button"
                  className={`mono small ${s.requestUrl} ${s.requestUrlButton}`}
                  onClick={handleCopyRequestUrl}
                >
                  {selected.method} {selected.url}
                </button>
                <p className="small muted">
                  {t.clientMeta(
                    selected.peer ?? '—',
                    selected.kind,
                    selected.scheme,
                    selected.durationMs != null ? `${selected.durationMs} ms` : '…',
                  )}
                </p>
                {selected.pending && (
                  <p className="small warn-text">
                    {t.pendingAtBreakpoint(selected.breakpointName ?? null)}
                  </p>
                )}
                {selected.kind === 'connect' && (
                  <p className="small muted">
                    {getTrafficConnectDetailNote(selected.error, selected.mitmBypassed)}
                  </p>
                )}
                <HeadersTable headers={selected.requestHeaders} />
                {selected.requestBodyPreview && (
                  <>
                    <h3>{t.body}</h3>
                    <pre className={s.pre}>{selected.requestBodyPreview}</pre>
                  </>
                )}
              </section>
              <section className={s.block}>
                <div className={s.blockHead}>
                  <h2>{t.sectionResponse}</h2>
                </div>
                {selected.pending && !selected.responseStatus && !selected.error && (
                  <p className="small muted">{t.noResponseYet}</p>
                )}
                {selected.error && <p className="err">{selected.error}</p>}
                {selected.responseStatus != null && (
                  <p className="mono">HTTP {selected.responseStatus}</p>
                )}
                {selected.responseHeaders && (
                  <HeadersTable headers={selected.responseHeaders} />
                )}
                {selectedIsEventStream && !selected.responseBodyPreview && (
                  <p className={`small muted ${s.hintSpaced}`}>
                    {t.streamBodyNoPreview}
                  </p>
                )}
                {selected.responseBodyPreview && (
                  <>
                    <h3>{t.body}</h3>
                    {selectedIsEventStream && (
                      <p className="small muted">{t.streamBodyHint}</p>
                    )}
                    <pre className={`${s.pre} ${s.preBody}`}>{selected.responseBodyPreview}</pre>
                  </>
                )}
              </section>
            </main>
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}
