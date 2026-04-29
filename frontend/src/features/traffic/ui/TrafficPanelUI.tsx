import { ScrollArea } from '@/components/ui/scroll-area'
import { trafficTexts as t } from '../texts'
import type { TrafficPanelUIProps } from '../types'
import s from './TrafficPanelUI.module.css'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'

export function TrafficPanelUI({
  urlFilter,
  setUrlFilter,
  testError,
  clearTraffic,
  filteredEntries,
  selectedId,
  setSelectedId,
  selected,
  selectedIsEventStream,
  openOverrideDrawer,
  addBreakpointFromSelected,
  resumeRequest,
  resumeSaving,
}: TrafficPanelUIProps) {
  return (
      <ResizablePanelGroup>
        <ResizablePanel
          defaultSize={380}
          minSize={16}
        >
          <aside className={s.listPanel}>
            <div className={s.listTools}>
              <button type="button" className="ghost" onClick={clearTraffic}>
                {t.clear}
              </button>
              <label className={s.listFilter}>
                <span className="sr-only">{t.filterAria}</span>
                <input
                  type="search"
                  value={urlFilter}
                  onChange={(e) => setUrlFilter(e.target.value)}
                  placeholder={t.filterPlaceholder}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </div>
            {testError && (
              <p className={`small err ${s.testErr}`}>
                {testError}
              </p>
            )}
            <ScrollArea className="min-h-0 flex-1">
              <ul className={s.reqList}>
                {[...filteredEntries].reverse().map((e) => {
                  const schemeLabel = e.kind === 'connect' ? t.schemeHttps : e.scheme.toUpperCase()
                  const summary =
                    e.kind === 'connect' ? t.connectTunnel(e.url) : e.url
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        className={`${s.row} ${selectedId === e.id ? s.rowActive : ''}`}
                        onClick={() => setSelectedId(e.id)}
                      >
                        <span className={s.scheme}>{schemeLabel}</span>
                        <span className={s.m}>{e.method}</span>
                        <span className={s.u} title={summary}>
                          {summary}
                        </span>
                        {e.pending && (
                          <span className={`${s.tag} ${s.tagWarn}`}>{t.tagPending}</span>
                        )}
                        {e.responseStatus != null && <span className={s.s}>{e.responseStatus}</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </ScrollArea>
          </aside>
        </ResizablePanel>
        <ResizableHandle
          withHandle
          className="w-1.5 shrink-0 bg-border/90"
        />
        <ResizablePanel
          className="min-h-0 min-w-0"
          minSize={28}
        >
          <main className={s.detail}>
            {selected ? (
              <>
                <section className={s.block}>
                  <h2>{t.sectionRequest}</h2>
                  <p className="mono small">
                    {selected.method} {selected.url}
                  </p>
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
                    <p className="small muted">{t.connectNote}</p>
                  )}
                  <pre className={s.pre}>
                    {selected.requestHeaders.map(([k, v]) => `${k}: ${v}\n`).join('')}
                  </pre>
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
                    <div className={s.detailActions}>
                      {selected.kind === 'http' && (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void addBreakpointFromSelected()}
                        >
                          {t.addBreakpoint}
                        </button>
                      )}
                      {selected.pending && !selected.streamControllable && (
                        <button
                          type="button"
                          className="primary inline-primary"
                          disabled={resumeSaving[selected.id] === true}
                          onClick={() => void resumeRequest(selected.id)}
                        >
                          {resumeSaving[selected.id] ? t.resuming : t.resume}
                        </button>
                      )}
                      {selected.kind === 'http' && (
                        <button type="button" className="ghost" onClick={openOverrideDrawer}>
                          {t.overrideResponse}
                        </button>
                      )}
                    </div>
                  </div>
                  {selected.pending && !selected.responseStatus && !selected.error && (
                    <p className="small muted">{t.noResponseYet}</p>
                  )}
                  {selected.error && <p className="err">{selected.error}</p>}
                  {selected.responseStatus != null && (
                    <p className="mono">HTTP {selected.responseStatus}</p>
                  )}
                  {selected.responseHeaders && (
                    <pre className={s.pre}>
                      {selected.responseHeaders.map(([k, v]) => `${k}: ${v}\n`).join('')}
                    </pre>
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
              </>
            ) : (
              <div className="muted">
                <p>
                  This list shows <strong>{t.empty.p1a}</strong> and{' '}
                  <strong>{t.empty.p1b}</strong> {t.empty.p1c}
                </p>
                <p>
                  {t.empty.p2a} <strong>{t.empty.p2b}</strong>
                  {t.empty.p2c} <code>{t.empty.p2d}</code> {t.empty.p2e}
                </p>
              </div>
            )}
          </main>
        </ResizablePanel>
      </ResizablePanelGroup>
  )
}
