import { copyTextToClipboard } from '@/lib/clipboard'
import { showSuccessToast, showToast } from '@/lib/toast'
import { Copy, X } from 'lucide-react'
import { trafficTexts as t } from '../texts'
import { getTrafficConnectDetailNote } from '../trafficDisplay'
import { TrafficVirtualListUI } from './TrafficVirtualListUI'
import type { TrafficPanelUIProps } from '../types'
import s from './TrafficPanelUI.module.css'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { useDefaultLayout } from 'react-resizable-panels'
import { LEFT_LIST_PANEL_DEFAULT_SIZE } from '@/lib/panelLayout'
import { HeadersTable } from '@/components/headers-table/HeadersTable'
import { TextContextMenuUI } from '../../text-actions/ui/TextContextMenuUI'
import { HighlightText } from './HighlightText'

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
  searchKeywords,
  onEntryCopyCurl,
  onEntrySaveRequest,
  onEntryOverride,
  onEntryAddBreakpoint,
  onEntryOpenSavedRequest,
  onEntryOpenMatchedOverride,
  onEntryOpenMatchedBreakpoint,
}: TrafficPanelUIProps) {
  const hasSelectedEntry = selectedId != null
  // 通过库自带持久化按「当前面板集合」精确记忆并恢复分栏宽度，切换 tab 后保持不变。
  const panelIds = hasSelectedEntry
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
            onOpenSavedRequest={onEntryOpenSavedRequest}
            onOpenMatchedOverride={onEntryOpenMatchedOverride}
            onOpenMatchedBreakpoint={onEntryOpenMatchedBreakpoint}
            searchKeywords={searchKeywords}
          />
        </aside>
      </ResizablePanel>
      {hasSelectedEntry && (
        <>
          <ResizableHandle withHandle className="w-1.5 shrink-0 bg-border/90" />
          <ResizablePanel
            className="min-h-0 min-w-0"
            minSize={28}
            defaultSize={38}
            id={TRAFFIC_DETAIL_PANEL_ID}
          >
            {selected ? (
              <main className={s.detail}>
                <section className={s.block}>
                  <div className={s.blockHead}>
                    <h2>{t.sectionRequest}</h2>
                    <div className={s.detailActions}>
                      <X
                        onClick={() => setSelectedId(null)}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                  <TextContextMenuUI fallbackText={selected.url}>
                    <div className={`mono small ${s.requestUrl}`}>
                      <span className={s.requestUrlText}>
                        {selected.method}{' '}
                        <HighlightText
                          text={selected.url}
                          keywords={searchKeywords}
                          markClassName={s.searchHighlight}
                        />
                      </span>
                      <button
                        type="button"
                        className={s.copyUrlButton}
                        aria-label={t.copyUrl}
                        onClick={handleCopyRequestUrl}
                      >
                        <Copy size={14} aria-hidden />
                      </button>
                    </div>
                  </TextContextMenuUI>
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
                  <TextContextMenuUI fallbackText={formatHeadersForAction(selected.requestHeaders)}>
                    <div>
                      <HeadersTable headers={selected.requestHeaders} />
                    </div>
                  </TextContextMenuUI>
                  {selected.requestBodyPreview && (
                    <>
                      <h3>{t.body}</h3>
                      <TextContextMenuUI fallbackText={selected.requestBodyPreview}>
                        <pre className={s.pre}>
                          <HighlightText
                            text={selected.requestBodyPreview}
                            keywords={searchKeywords}
                            markClassName={s.searchHighlight}
                          />
                        </pre>
                      </TextContextMenuUI>
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
                    <TextContextMenuUI fallbackText={formatHeadersForAction(selected.responseHeaders)}>
                      <div>
                        <HeadersTable headers={selected.responseHeaders} />
                      </div>
                    </TextContextMenuUI>
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
                      <TextContextMenuUI fallbackText={selected.responseBodyPreview}>
                        <pre className={`${s.pre} ${s.preBody}`}>
                          <HighlightText
                            text={selected.responseBodyPreview}
                            keywords={searchKeywords}
                            markClassName={s.searchHighlight}
                          />
                        </pre>
                      </TextContextMenuUI>
                    </>
                  )}
                </section>
              </main>
            ) : (
              <main className={s.detail}>
                <section className={s.block}>
                  <div className={s.blockHead}>
                    <h2>{t.sectionRequest}</h2>
                    <div className={s.detailActions}>
                      <X
                        onClick={() => setSelectedId(null)}
                        className="cursor-pointer"
                      />
                    </div>
                  </div>
                  <p className="small muted">{t.loadingDetail}</p>
                </section>
              </main>
            )}
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  )
}

function formatHeadersForAction(headers: [string, string][]): string {
  return JSON.stringify(Object.fromEntries(headers), null, 2)
}
