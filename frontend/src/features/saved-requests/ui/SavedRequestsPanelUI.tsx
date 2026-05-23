import { ScrollArea } from '@/components/ui/scroll-area'
import { alertByEnv, confirmByEnv } from '../../../lib/appDialog'
import { savedRequestsTexts as t } from '../texts'
import type { SavedRequestsPanelUIProps } from '../types'
import s from './SavedRequestsPanelUI.module.css'

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function headersToText(headers: [string, string][] | null | undefined): string {
  return headers?.map(([key, value]) => `${key}: ${value}\n`).join('') ?? ''
}

export function SavedRequestsPanelUI({
  savedRequests,
  selectedSavedRequestId,
  setSelectedSavedRequestId,
  closeSavedRequestsPanel,
  removeSavedRequest,
  clearSavedRequests,
}: SavedRequestsPanelUIProps) {
  const selectedSavedRequest =
    savedRequests.find((request) => request.id === selectedSavedRequestId) ??
    savedRequests[0] ??
    null
  const selectedEntry = selectedSavedRequest?.entry ?? null

  return (
    <div
      className={s.fsBackdrop}
      role="presentation"
      onClick={closeSavedRequestsPanel}
    >
      <div
        className={s.fs}
        role="dialog"
        aria-modal="true"
        aria-labelledby="saved-requests-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.fsHead}>
          <div>
            <h2 id="saved-requests-title">{t.shell.title}</h2>
            <p className="small muted" style={{ margin: '0.15rem 0 0' }}>
              {t.shell.subtitle}
            </p>
          </div>
          <button
            type="button"
            className={`ghost ${s.drawerClose}`}
            onClick={closeSavedRequestsPanel}
            aria-label={t.shell.closeAria}
          >
            ×
          </button>
        </div>

        <div className={s.fsBody}>
          <aside className={s.listPanel}>
            <div className={s.listTools}>
              <button
                type="button"
                className="ghost danger"
                disabled={savedRequests.length === 0}
                onClick={async () => {
                  const isConfirmed = await confirmByEnv(t.clearAllConfirm)
                  if (!isConfirmed) return
                  void clearSavedRequests().catch((e) => {
                    void alertByEnv(String(e))
                  })
                }}
              >
                {t.clearAll}
              </button>
            </div>
            {savedRequests.length === 0 ? (
              <p className={`muted ${s.empty}`}>{t.empty}</p>
            ) : (
              <ScrollArea className="min-h-0 flex-1">
                <ul className={s.list}>
                  {savedRequests.map((request) => {
                    const entry = request.entry
                    return (
                      <li key={request.id}>
                        <button
                          type="button"
                          className={`${s.row} ${
                            selectedSavedRequest?.id === request.id
                              ? s.rowActive
                              : ''
                          }`}
                          onClick={() => setSelectedSavedRequestId(request.id)}
                        >
                          <span className={s.method}>{entry.method}</span>
                          <span className={s.url} title={entry.url}>
                            {entry.url}
                          </span>
                          {entry.responseStatus != null && (
                            <span className={s.status}>
                              {entry.responseStatus}
                            </span>
                          )}
                          <p className={`small muted ${s.savedAt}`}>
                            {t.savedAt(formatDateTime(request.savedAt))}
                          </p>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </ScrollArea>
            )}
          </aside>

          <main className={s.detail}>
            {selectedSavedRequest && selectedEntry ? (
              <>
                <div className={s.detailHead}>
                  <div>
                    <p className="mono">
                      {selectedEntry.method} {selectedEntry.url}
                    </p>
                    <p className="small muted">
                      {t.savedAt(formatDateTime(selectedSavedRequest.savedAt))}
                    </p>
                  </div>
                  <div className={s.detailActions}>
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={async () => {
                        const isConfirmed = await confirmByEnv(t.deleteConfirm)
                        if (!isConfirmed) return
                        void removeSavedRequest(selectedSavedRequest.id).catch(
                          (e) => {
                            void alertByEnv(String(e))
                          },
                        )
                      }}
                    >
                      {t.delete}
                    </button>
                  </div>
                </div>

                <section className={s.block}>
                  <h3>{t.request}</h3>
                  <p className="small muted">
                    {t.meta(
                      selectedEntry.peer,
                      selectedEntry.kind,
                      selectedEntry.scheme,
                      selectedEntry.durationMs != null
                        ? `${selectedEntry.durationMs} ms`
                        : '…',
                    )}
                  </p>
                  <p className="small muted">
                    {t.originalAt(formatDateTime(selectedEntry.at))}
                  </p>
                  <pre className={s.pre}>
                    {headersToText(selectedEntry.requestHeaders)}
                  </pre>
                  {selectedEntry.requestBodyPreview && (
                    <>
                      <h3>{t.body}</h3>
                      <pre className={s.pre}>
                        {selectedEntry.requestBodyPreview}
                      </pre>
                    </>
                  )}
                </section>

                <section className={s.block}>
                  <h3>{t.response}</h3>
                  {selectedEntry.error && <p className="err">{selectedEntry.error}</p>}
                  {selectedEntry.responseStatus != null && (
                    <p className="mono">HTTP {selectedEntry.responseStatus}</p>
                  )}
                  {selectedEntry.responseHeaders ? (
                    <pre className={s.pre}>
                      {headersToText(selectedEntry.responseHeaders)}
                    </pre>
                  ) : (
                    <p className="small muted">{t.noResponse}</p>
                  )}
                  {selectedEntry.responseBodyPreview && (
                    <>
                      <h3>{t.body}</h3>
                      <pre className={s.pre}>
                        {selectedEntry.responseBodyPreview}
                      </pre>
                    </>
                  )}
                </section>
              </>
            ) : (
              <p className="muted">{t.empty}</p>
            )}
          </main>
        </div>
      </div>
    </div>
  )
}
