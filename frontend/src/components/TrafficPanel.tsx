import type { TrafficEntry } from '../types'

type Props = {
  urlFilter: string
  setUrlFilter: (v: string) => void
  testError: string | null
  sendTestProxy: () => void
  clearTraffic: () => void
  filteredEntries: TrafficEntry[]
  selectedId: string | null
  setSelectedId: (id: string) => void
  selected: TrafficEntry | null
  selectedIsEventStream: boolean
  openOverrideDrawer: () => void
  addBreakpointFromSelected: () => void
  resumeRequest: (id: string) => void
  resumeSaving: Record<string, boolean>
}

export function TrafficPanel({
  urlFilter,
  setUrlFilter,
  testError,
  sendTestProxy,
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
}: Props) {
  return (
    <div className="grid">
      <aside className="list-panel">
        <div className="list-tools">
          <button type="button" className="primary" onClick={sendTestProxy}>
            Test proxy
          </button>
          <button type="button" className="ghost" onClick={clearTraffic}>
            Clear
          </button>
          <label className="list-filter">
            <span className="sr-only">Filter by URL substring</span>
            <input
              type="search"
              value={urlFilter}
              onChange={(e) => setUrlFilter(e.target.value)}
              placeholder="Filter URL…"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
        </div>
        {testError && (
          <p className="small err" style={{ margin: '0 0 8px 0' }}>
            {testError}
          </p>
        )}
        <ul className="req-list">
          {[...filteredEntries].reverse().map((e) => {
            const schemeLabel = e.kind === 'connect' ? 'HTTPS' : e.scheme.toUpperCase()
            const summary = e.kind === 'connect' ? `${e.url} (TLS tunnel)` : e.url
            return (
              <li key={e.id}>
                <button
                  type="button"
                  className={selectedId === e.id ? 'row active' : 'row'}
                  onClick={() => setSelectedId(e.id)}
                >
                  <span className="scheme">{schemeLabel}</span>
                  <span className="m">{e.method}</span>
                  <span className="u" title={summary}>
                    {summary}
                  </span>
                  {e.pending && <span className="tag warn">pending</span>}
                  {e.mocked && <span className="tag">mock</span>}
                  {e.responseStatus != null && <span className="s">{e.responseStatus}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </aside>

      <main className="detail">
        {selected ? (
          <>
            <section className="block">
              <h2>Request</h2>
              <p className="mono small">
                {selected.method} {selected.url}
              </p>
              <p className="small muted">
                client {selected.peer ?? '—'} · {selected.kind} · {selected.scheme} ·{' '}
                {selected.durationMs != null ? `${selected.durationMs} ms` : '…'}
              </p>
              {selected.pending && (
                <p className="small warn-text">
                  Pending at breakpoint
                  {selected.breakpointName ? `: ${selected.breakpointName}` : ''}. The
                  client is waiting for you to resume this request.
                </p>
              )}
              {selected.kind === 'connect' && (
                <p className="small muted">
                  HTTPS uses a CONNECT tunnel; paths and bodies inside TLS are not visible
                  to the proxy.
                </p>
              )}
              <pre className="pre">
                {selected.requestHeaders.map(([k, v]) => `${k}: ${v}\n`).join('')}
              </pre>
              {selected.requestBodyPreview && (
                <>
                  <h3>Body</h3>
                  <pre className="pre">{selected.requestBodyPreview}</pre>
                </>
              )}
            </section>
            <section className="block">
              <div className="block-head">
                <h2>Response</h2>
                <div className="detail-actions">
                  {selected.kind === 'http' && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void addBreakpointFromSelected()}
                    >
                      Add breakpoint
                    </button>
                  )}
                  {selected.pending && !selected.streamControllable && (
                    <button
                      type="button"
                      className="primary inline-primary"
                      disabled={resumeSaving[selected.id] === true}
                      onClick={() => void resumeRequest(selected.id)}
                    >
                      {resumeSaving[selected.id] ? 'Resuming…' : 'Resume'}
                    </button>
                  )}
                  {selected.kind === 'http' && (
                    <button type="button" className="ghost" onClick={openOverrideDrawer}>
                      Override response
                    </button>
                  )}
                </div>
              </div>
              {selected.pending && !selected.responseStatus && !selected.error && (
                <p className="small muted">
                  No response yet because this request is paused before override or
                  upstream handling.
                </p>
              )}
              {selected.error && <p className="err">{selected.error}</p>}
              {selected.responseStatus != null && (
                <p className="mono">HTTP {selected.responseStatus}</p>
              )}
              {selected.responseHeaders && (
                <pre className="pre">
                  {selected.responseHeaders.map(([k, v]) => `${k}: ${v}\n`).join('')}
                </pre>
              )}
              {selectedIsEventStream && !selected.responseBodyPreview && (
                <p className="small muted" style={{ marginTop: '8px' }}>
                  Streaming response — body fills in as chunks arrive (retained up to ~64 MB
                  for the dashboard).
                </p>
              )}
              {selected.responseBodyPreview && (
                <>
                  <h3>Body</h3>
                  {selectedIsEventStream && (
                    <p className="small muted">
                      Full streamed body retained for this view (up to ~64 MB). Updates
                      while the connection stays open; the last chunk is shown when the
                      stream ends.
                    </p>
                  )}
                  <pre className="pre pre-body">{selected.responseBodyPreview}</pre>
                </>
              )}
            </section>
          </>
        ) : (
          <div className="muted">
            <p>
              This list shows <strong>every HTTP request</strong> and{' '}
              <strong>every HTTPS CONNECT tunnel</strong> that clients send through this
              proxy. Only traffic routed via <code>HTTP_PROXY</code>/
              <code>HTTPS_PROXY</code> or a system proxy appears here — not other programs on
              the machine.
            </p>
            <p>
              Select a row, use <strong>Test proxy</strong>, or point a client at the proxy
              (browsers need OS proxy settings or an extension; shell <code>export</code> alone
              does not affect them).
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
