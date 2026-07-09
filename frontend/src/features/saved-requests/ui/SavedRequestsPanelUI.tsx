import { useMemo } from 'react'
import { NotebookPen, Trash2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SimpleTooltip } from '@/components/ui/tooltip'
import { HostGroupList } from '@/components/host-group-list/HostGroupList'
import { HeadersTable } from '@/components/headers-table/HeadersTable'
import { PanelHeader, panelHeaderStyles as ph } from '@/components/panel-header'
import { LEFT_LIST_PANEL_DEFAULT_SIZE } from '@/lib/panelLayout'
import { ConfirmCancelledError, confirm } from '../../../lib/confirm'
import { showToast } from '../../../lib/toast'
import type { SavedRequest } from '../../../types'
import { TextContextMenuUI } from '../../text-actions/ui/TextContextMenuUI'
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

export function SavedRequestsPanelUI({
  savedRequests,
  selectedSavedRequestId,
  setSelectedSavedRequestId,
  closeSavedRequestsPanel,
  variant = 'dialog',
  composeSavedRequest,
  removeSavedRequest,
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

  const handleDeleteSelected = async () => {
    if (!selectedSavedRequest) return
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
  }

  const renderItem = (request: SavedRequest) => {
    const entry = request.entry
    const isActive = selectedSavedRequest?.id === request.id
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            className={`${s.itemButton} ${isActive ? s.itemButtonActive : ''}`}
            onClick={() => setSelectedSavedRequestId(request.id)}
            onContextMenu={() => setSelectedSavedRequestId(request.id)}
          >
            <span className={s.itemPath} title={`${entry.method} ${entry.url}`}>
              {urlPathLabel(entry.url)}
            </span>
            {entry.responseStatus != null && (
              <span className={s.itemStatus}>{entry.responseStatus}</span>
            )}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => composeSavedRequest(request.id)}>
            <NotebookPen aria-hidden />
            {t.compose}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
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
        <PanelHeader
          id="saved-requests-title"
          title={t.shell.title}
          actions={
            selectedSavedRequest && selectedEntry ? (
              <SimpleTooltip label={t.delete}>
                <button
                  type="button"
                  className={`ghost danger ${ph.iconBtn}`}
                  aria-label={t.delete}
                  onClick={handleDeleteSelected}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </SimpleTooltip>
            ) : undefined
          }
          onClose={isInline ? undefined : closeSavedRequestsPanel}
          closeAriaLabel={t.shell.closeAria}
        />

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
                      <div className={s.detailMeta}>
                        <TextContextMenuUI fallbackText={selectedEntry.url}>
                          <p className={`mono ${s.detailUrl}`}>
                            {selectedEntry.method} {selectedEntry.url}
                          </p>
                        </TextContextMenuUI>
                        <p className="small muted">
                          {t.savedAt(
                            formatDateTime(selectedSavedRequest.savedAt),
                          )}
                        </p>
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
                      <TextContextMenuUI fallbackText={formatHeadersForAction(selectedEntry.requestHeaders)}>
                        <div>
                          <HeadersTable headers={selectedEntry.requestHeaders} />
                        </div>
                      </TextContextMenuUI>
                      {selectedEntry.requestBodyPreview && (
                        <>
                          <h3>{t.body}</h3>
                          <TextContextMenuUI fallbackText={selectedEntry.requestBodyPreview}>
                            <pre className={s.pre}>
                              {selectedEntry.requestBodyPreview}
                            </pre>
                          </TextContextMenuUI>
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
                        <TextContextMenuUI fallbackText={formatHeadersForAction(selectedEntry.responseHeaders)}>
                          <div>
                            <HeadersTable headers={selectedEntry.responseHeaders} />
                          </div>
                        </TextContextMenuUI>
                      ) : (
                        <p className="small muted">{t.noResponse}</p>
                      )}
                      {selectedEntry.responseBodyPreview && (
                        <>
                          <h3>{t.body}</h3>
                          <TextContextMenuUI fallbackText={selectedEntry.responseBodyPreview}>
                            <pre className={s.pre}>
                              {selectedEntry.responseBodyPreview}
                            </pre>
                          </TextContextMenuUI>
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

function formatHeadersForAction(headers: [string, string][]): string {
  return JSON.stringify(Object.fromEntries(headers), null, 2)
}
