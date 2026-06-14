import { useMemo } from 'react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { HostGroupList } from '@/components/host-group-list/HostGroupList'
import { LEFT_LIST_PANEL_DEFAULT_SIZE } from '@/lib/panelLayout'
import { ConfirmCancelledError, confirm } from '../../../lib/confirm'
import { showToast } from '../../../lib/toast'
import type { SavedRequest } from '../../../types'
import { buildSavedRequestGroups } from '../savedRequestGroups'
import { savedRequestsTexts as t } from '../texts'
import type { SavedRequestsPanelUIProps } from '../types'
import s from './SavedRequestsPanelUI.module.css'

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function urlPathLabel(url: string): string {
  try {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}` || '/'
  } catch {
    return url
  }
}

function headersToText(headers: [string, string][] | null | undefined): string {
  return headers?.map(([key, value]) => `${key}: ${value}\n`).join('') ?? ''
}

export function SavedRequestsPanelUI({
  savedRequests,
  selectedSavedRequestId,
  setSelectedSavedRequestId,
  closeSavedRequestsPanel,
  variant = 'dialog',
  removeSavedRequest,
  clearSavedRequests,
}: SavedRequestsPanelUIProps) {
  const isInline = variant !== 'dialog'
  const inlineClassName = variant === 'sidebar' ? s.sidebarFs : s.embeddedFs
  const selectedSavedRequest =
    savedRequests.find((request) => request.id === selectedSavedRequestId) ??
    savedRequests[0] ??
    null
  const selectedEntry = selectedSavedRequest?.entry ?? null

  const groups = useMemo(
    () => buildSavedRequestGroups(savedRequests),
    [savedRequests],
  )

  const renderItem = (request: SavedRequest) => {
    const entry = request.entry
    const isActive = selectedSavedRequest?.id === request.id
    return (
      <button
        type="button"
        className={`${s.itemButton} ${isActive ? s.itemButtonActive : ''}`}
        onClick={() => setSelectedSavedRequestId(request.id)}
      >
        <span className={s.itemMethod}>{entry.method}</span>
        <span className={s.itemPath} title={entry.url}>
          {urlPathLabel(entry.url)}
        </span>
        {entry.responseStatus != null && (
          <span className={s.itemStatus}>{entry.responseStatus}</span>
        )}
      </button>
    )
  }

  return (
    <div
      className={isInline ? s.sidebarBackdrop : s.fsBackdrop}
      role="presentation"
      onClick={isInline ? undefined : closeSavedRequestsPanel}
    >
      <div
        className={`${s.fs} ${isInline ? inlineClassName : ''}`}
        role={isInline ? undefined : 'dialog'}
        aria-modal={isInline ? undefined : 'true'}
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
          {!isInline && (
            <button
              type="button"
              className={`ghost ${s.drawerClose}`}
              onClick={closeSavedRequestsPanel}
              aria-label={t.shell.closeAria}
            >
              ×
            </button>
          )}
        </div>

        <div className={s.fsBody}>
          <ResizablePanelGroup
            orientation="horizontal"
            className="min-h-0 min-w-0 flex-1"
            id="saved-requests-panels"
          >
            <ResizablePanel
              className="min-h-0 min-w-0"
              defaultSize={LEFT_LIST_PANEL_DEFAULT_SIZE}
              id="saved-requests-list"
              minSize={16}
            >
              <aside className={s.listPanel}>
                <div className={s.listTools}>
                  <button
                    type="button"
                    className="ghost danger"
                    disabled={savedRequests.length === 0}
                    onClick={async () => {
                      try {
                        await confirm({
                          title: t.clearAll,
                          description: t.clearAllConfirm,
                          confirmLabel: t.clearAll,
                        })
                        await clearSavedRequests()
                      } catch (e) {
                        if (e instanceof ConfirmCancelledError) return
                        showToast(String(e), 'error')
                      }
                    }}
                  >
                    {t.clearAll}
                  </button>
                </div>
                {savedRequests.length === 0 ? (
                  <p className={`muted ${s.empty}`}>{t.empty}</p>
                ) : (
                  <ScrollArea className="min-h-0 flex-1">
                    <div className={s.listBody}>
                      <HostGroupList
                        groups={groups}
                        idPrefix="saved-host"
                        getItemKey={(request) => request.id}
                        renderItem={renderItem}
                        toggleLabel={t.toggleHostGroup}
                      />
                    </div>
                  </ScrollArea>
                )}
              </aside>
            </ResizablePanel>
            <ResizableHandle
              withHandle
              className="w-1.5 shrink-0 bg-border/90"
            />
            <ResizablePanel
              className="min-h-0 min-w-0"
              id="saved-requests-detail"
              minSize={28}
            >
              <main className={s.detail}>
                {selectedSavedRequest && selectedEntry ? (
                  <>
                    <div className={s.detailHead}>
                      <div>
                        <p className="mono">
                          {selectedEntry.method} {selectedEntry.url}
                        </p>
                        <p className="small muted">
                          {t.savedAt(
                            formatDateTime(selectedSavedRequest.savedAt),
                          )}
                        </p>
                      </div>
                      <div className={s.detailActions}>
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={async () => {
                            try {
                              await confirm({
                                title: t.delete,
                                description: t.deleteConfirm,
                                confirmLabel: t.delete,
                              })
                              await removeSavedRequest(selectedSavedRequest.id)
                            } catch (e) {
                              if (e instanceof ConfirmCancelledError) return
                              showToast(String(e), 'error')
                            }
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
                      {selectedEntry.error && (
                        <p className="err">{selectedEntry.error}</p>
                      )}
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
                  <p className="muted">{t.selectHint}</p>
                )}
              </main>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  )
}
