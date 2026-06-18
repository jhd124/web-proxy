import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Save, FilePlusCorner, StepForward, Trash2 } from 'lucide-react'
import { usePanelRef, type PanelSize } from 'react-resizable-panels'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  isDefaultOverrideForm,
  parseHeadersText,
  urlOrigin,
} from '../../../lib/dashboardUtils'
import { ConfirmCancelledError, confirm } from '../../../lib/confirm'
import { showToast } from '../../../lib/toast'
import { LEFT_LIST_PANEL_DEFAULT_SIZE } from '@/lib/panelLayout'
import type { OverrideRule } from '../../../types'
import { overrideEditorTexts } from '../texts'
import type { OverrideEditorUIProps } from '../types'
import { OverrideBodyEditorUI } from './OverrideBodyEditorUI'
import { OverrideFilesUI } from './OverrideFilesUI'
import { OverrideRequestFormUI } from './OverrideRequestFormUI'
import { PanelHeader, panelHeaderStyles as ph } from '@/components/panel-header'
import { RuleBulkActionsMenu } from './RuleBulkActionsMenu'
import { RuleEnabledToggleButton } from './RuleEnabledToggleButton'
import { TooltipButton } from './TooltipButton'
import s from './OverrideEditorUI.module.css'

const t = overrideEditorTexts.shell
const tf = overrideEditorTexts.files

const REQUEST_PCT = '24%'
const DRAG_OPEN_THRESHOLD = 4

type FabPos = { x: number; y: number }

type FabPointerState = {
  startX: number
  startY: number
  orig: FabPos
  didDrag: boolean
}

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n))
}

type ComparableOverridePayload = {
  matchMethod: string | null
  matchProtocol: string | null
  matchHost: string | null
  matchPath: string | null
  matchRequestHeaders: [string, string][]
  matchQuery: [string, string][]
  matchRequestBody: string | null
  mapRemoteProtocol: string | null
  mapRemoteHost: string | null
  mapRemotePath: string | null
  status: number
  headers: [string, string][]
  body: string
  streamIntervalMs: number | null
}

function normalizeRows(rows: [string, string][]): [string, string][] {
  return rows.filter(([name, value]) => name.trim() !== '' || value.trim() !== '')
}

function toComparableFromForm(
  form: OverrideEditorUIProps['overrideForm'],
): ComparableOverridePayload {
  const streamIntervalMs = form.streamEnabled
    ? Math.max(0, Number(form.streamIntervalMs) || 500)
    : null
  return {
    matchMethod: form.matchMethod.trim() || null,
    matchProtocol: form.matchProtocol || null,
    matchHost: form.matchHost.trim() || null,
    matchPath: form.matchPath || null,
    matchRequestHeaders: normalizeRows(form.matchRequestHeaders),
    matchQuery: normalizeRows(form.matchQuery),
    matchRequestBody: form.matchRequestBody.trim() || null,
    mapRemoteProtocol: form.mapRemoteEnabled ? form.mapRemoteProtocol.trim() || null : null,
    mapRemoteHost: form.mapRemoteEnabled ? form.mapRemoteHost.trim() || null : null,
    mapRemotePath: form.mapRemoteEnabled ? form.mapRemotePath.trim() || null : null,
    status: form.status,
    headers: parseHeadersText(form.headersText),
    body: form.body,
    streamIntervalMs,
  }
}

function toComparableFromRule(rule: OverrideRule): ComparableOverridePayload {
  const hasMapRemote =
    !!rule.mapRemoteProtocol?.trim() && !!rule.mapRemoteHost?.trim()
  return {
    matchMethod: rule.matchMethod?.trim() || null,
    matchProtocol: rule.matchProtocol || null,
    matchHost: rule.matchHost?.trim() || null,
    matchPath: rule.matchPath || null,
    matchRequestHeaders: normalizeRows([...(rule.matchRequestHeaders ?? [])]),
    matchQuery: normalizeRows([...(rule.matchQuery ?? [])]),
    matchRequestBody: rule.matchRequestBody?.trim() || null,
    mapRemoteProtocol: hasMapRemote ? rule.mapRemoteProtocol?.trim() || null : null,
    mapRemoteHost: hasMapRemote ? rule.mapRemoteHost?.trim() || null : null,
    mapRemotePath: hasMapRemote ? rule.mapRemotePath?.trim() || null : null,
    status: rule.status,
    headers: [...(rule.headers ?? [])],
    body: rule.body,
    streamIntervalMs: rule.streamIntervalMs != null ? Math.max(0, rule.streamIntervalMs) : null,
  }
}

export function OverrideEditorUI({
  closeOverrideDrawer,
  variant = 'dialog',
  saveOverride,
  overrideError,
  requestPanelFocusKey,
  overrideFileInputRef,
  overrideForm,
  setOverrideForm,
  overrideEntries,
  startNewOverride,
  openOverrideEditorForKey,
  overrideToggleSaving,
  setOverrideEnabled,
  deleteOverrideRule,
  selected,
  selectedMatchingOverride,
  overrideEditingId,
  selectedCanControlStream,
  resumeRequest,
  resumeSaving,
  addBreakpointFromOverride,
  streamActionSaving,
  playControlledStream,
  pauseControlledStream,
  computedOverrideId,
}: OverrideEditorUIProps) {
  const isInline = variant !== 'dialog'
  const inlineClassName = variant === 'sidebar' ? s.sidebarFs : s.embeddedFs
  const requestPanelRef = usePanelRef()
  const [requestCollapsed, setRequestCollapsed] = useState(false)
  const [fabPos, setFabPos] = useState<FabPos>({ x: 0, y: 0 })
  const bodyRef = useRef<HTMLDivElement | null>(null)
  const fabPointer = useRef<FabPointerState | null>(null)

  const onRequestPanelResize = (size: PanelSize) => {
    setRequestCollapsed(size.asPercentage < 0.5)
  }

  const isDefaultOverride = useMemo(() => isDefaultOverrideForm(overrideForm), [overrideForm])

  useLayoutEffect(() => {
    if (requestPanelFocusKey === 0) return
    requestPanelRef.current?.resize(REQUEST_PCT)
  }, [requestPanelFocusKey, requestPanelRef])

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      const isSaveShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 's'
      if (!isSaveShortcut) return
      event.preventDefault()
      saveOverride()
    }

    window.addEventListener('keydown', handleSaveShortcut, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleSaveShortcut, {
        capture: true,
      })
    }
  }, [saveOverride])

  const openRequestFromFab = () => {
    requestPanelRef.current?.resize(REQUEST_PCT)
  }

  const editingRule = overrideEditingId
    ? (overrideEntries.find((r) => r.id === overrideEditingId) ?? null)
    : null
  const hasUnsavedChanges = useMemo(() => {
    if (!editingRule) {
      return !isDefaultOverride
    }
    const formPayload = toComparableFromForm(overrideForm)
    const rulePayload = toComparableFromRule(editingRule)
    return JSON.stringify(formPayload) !== JSON.stringify(rulePayload)
  }, [editingRule, isDefaultOverride, overrideForm])
  const isEditingOverride = editingRule !== null || !isDefaultOverride

  const actionButtons = (
    <>
      <TooltipButton
        type="button"
        className={`ghost ${ph.iconBtn}`}
        onClick={startNewOverride}
        aria-label={tf.newRule}
        tooltip={tf.newRule}
      >
        <FilePlusCorner size={16} aria-hidden />
      </TooltipButton>
      {isEditingOverride ? (
        <TooltipButton
          type="button"
          className={`${hasUnsavedChanges ? 'primary' : 'ghost'} ${ph.iconBtn}`}
          onClick={() => saveOverride()}
          aria-label={overrideEditingId ? t.saveChanges : t.saveOverride}
          tooltip={overrideEditingId ? t.saveChanges : t.saveOverride}
        >
          <Save size={16} aria-hidden />
        </TooltipButton>
      ) : null}
      {editingRule ? (
        <>
          {selected?.pending &&
            selectedMatchingOverride?.id === overrideEditingId && (
              <TooltipButton
                type="button"
                className="primary inline-primary"
                disabled={resumeSaving[selected.id] === true}
                aria-label={resumeSaving[selected.id] ? t.footResuming : t.footResumeRequest}
                tooltip={resumeSaving[selected.id] ? t.footResuming : t.footResumeRequest}
                onClick={() => void resumeRequest(selected.id)}
              >
                {resumeSaving[selected.id] ? t.footResuming : t.footResumeRequest}
              </TooltipButton>
            )}
          <TooltipButton
            type="button"
            className={`ghost ${ph.iconBtn}`}
            aria-label={t.footAddBreakpoint}
            tooltip={t.footAddBreakpoint}
            onClick={() => {
              addBreakpointFromOverride(
                {
                  name:
                    [overrideForm.matchHost, overrideForm.matchPath]
                      .map((x) => (x ?? '').trim())
                      .filter(Boolean)
                      .join(' ') || 'Override',
                  matchMethod: overrideForm.matchMethod || null,
                  matchHost: overrideForm.matchHost || null,
                  matchPath: overrideForm.matchPath || null,
                },
                selectedMatchingOverride?.id === overrideEditingId && selected
                  ? urlOrigin(selected.url)
                  : undefined,
              )
              closeOverrideDrawer()
            }}
          >
            <StepForward size={16} aria-hidden />
          </TooltipButton>
          <RuleEnabledToggleButton
            enabled={overrideForm.enabled}
            isSaving={overrideToggleSaving[editingRule.id] === true}
            enableLabel={tf.enable}
            disableLabel={tf.disable}
            savingLabel={tf.saving}
            onToggle={(nextEnabled: boolean) => {
              setOverrideForm((f) => ({ ...f, enabled: nextEnabled }))
              saveOverride({ enabled: nextEnabled })
            }}
          />
          <TooltipButton
            type="button"
            className={`ghost danger ${ph.iconBtn}`}
            aria-label={tf.deleteRule}
            tooltip={tf.deleteRule}
            onClick={async () => {
              try {
                await confirm({
                  title: tf.deleteRule,
                  description: tf.deleteRuleConfirm,
                  confirmLabel: tf.deleteRule,
                })
                await deleteOverrideRule(editingRule.id)
                startNewOverride()
              } catch (e) {
                if (e instanceof ConfirmCancelledError) return
                showToast(String(e), 'error')
              }
            }}
          >
            <Trash2 size={16} aria-hidden />
          </TooltipButton>
          {!isInline && (
            <TooltipButton
              type="button"
              className="ghost"
              aria-label={t.footCancel}
              tooltip={t.footCancel}
              onClick={closeOverrideDrawer}
            >
              {t.footCancel}
            </TooltipButton>
          )}
        </>
      ) : null}
      <RuleBulkActionsMenu
        rules={overrideEntries}
        toggleSaving={overrideToggleSaving}
        labels={{
          menu: tf.moreActions,
          enableAll: tf.enableAll,
          disableAll: tf.disableAll,
          saving: tf.saving,
        }}
        setRuleEnabled={setOverrideEnabled}
      />
    </>
  )

  return (
    <div
      className={isInline ? s.sidebarBackdrop : s.fsBackdrop}
      role="presentation"
      onClick={isInline ? undefined : closeOverrideDrawer}
    >
      <div
        className={`${s.fs} ${isInline ? inlineClassName : ''}`}
        role={isInline ? undefined : 'dialog'}
        aria-modal={isInline ? undefined : 'true'}
        aria-labelledby="override-fs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <PanelHeader
          id="override-fs-title"
          title={t.title}
          actions={actionButtons}
          onClose={isInline ? undefined : closeOverrideDrawer}
          closeAriaLabel={t.closeAria}
        />
        {overrideError && (
          <p className={`small err ${s.fsErr}`}>{overrideError}</p>
        )}
        <div ref={bodyRef} className={s.fsBody}>
          <ResizablePanelGroup
            orientation="horizontal"
            className="min-h-0 min-w-0 flex-1"
            id="override-editor-panels"
          >
            <ResizablePanel
              className="min-h-0 min-w-0"
              defaultSize={LEFT_LIST_PANEL_DEFAULT_SIZE}
              id="override-tools"
              minSize={16}
            >
              <aside className={s.toolCol}>
                <div className={s.toolBody}>
                  <OverrideFilesUI
                    overrideFileInputRef={overrideFileInputRef}
                    overrideForm={overrideForm}
                    setOverrideForm={setOverrideForm}
                    overrideEntries={overrideEntries}
                    overrideEditingId={overrideEditingId}
                    openOverrideEditorForKey={openOverrideEditorForKey}
                  />
                </div>
              </aside>
            </ResizablePanel>
            <ResizableHandle
              withHandle
              className="w-1.5 shrink-0 bg-border/90"
            />
            <ResizablePanel
              className="min-h-0 min-w-0"
              id="override-monaco"
              minSize={28}
            >
              {isEditingOverride ? (
                <OverrideBodyEditorUI
                  overrideEditingId={overrideEditingId}
                  overrideForm={overrideForm}
                  setOverrideForm={setOverrideForm}
                />
              ) : (
                <div className={s.editorEmpty}>
                  <p className="muted">{t.emptyEditor}</p>
                </div>
              )}
            </ResizablePanel>
            <ResizableHandle
              withHandle
              className="w-1.5 shrink-0 bg-border/90"
            />
            <ResizablePanel
              className="min-h-0 min-w-0"
              defaultSize={computedOverrideId ? "24%" : 0}
              id="override-request"
              minSize={0}
              panelRef={requestPanelRef}
              onResize={onRequestPanelResize}
            >
              <div className={s.requestCol}>
                <OverrideRequestFormUI
                  overrideForm={overrideForm}
                  setOverrideForm={setOverrideForm}
                  selectedCanControlStream={selectedCanControlStream}
                  selected={selected}
                  streamActionSaving={streamActionSaving}
                  playControlledStream={playControlledStream}
                  pauseControlledStream={pauseControlledStream}
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>

          {requestCollapsed && !isDefaultOverride && (
            <div
              role="button"
              tabIndex={0}
              className={s.requestOpenFab}
              style={{
                transform: `translate(${fabPos.x}px, ${fabPos.y}px)`,
              }}
              title={t.fabDrag}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openRequestFromFab()
                }
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                e.preventDefault()
                fabPointer.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  orig: { x: fabPos.x, y: fabPos.y },
                  didDrag: false,
                }
                e.currentTarget.setPointerCapture(e.pointerId)
              }}
              onPointerMove={(e) => {
                const p = fabPointer.current
                if (!p) return
                const dx = e.clientX - p.startX
                const dy = e.clientY - p.startY
                if (Math.hypot(dx, dy) > DRAG_OPEN_THRESHOLD) p.didDrag = true
                const b = bodyRef.current
                if (b) {
                  const w = b.clientWidth
                  const h = b.clientHeight
                  const nx = clamp(
                    p.orig.x + dx,
                    -w + 40,
                    0,
                  )
                  const ny = clamp(p.orig.y + dy, -h * 0.4, h * 0.4)
                  setFabPos({ x: nx, y: ny })
                } else {
                  setFabPos({ x: p.orig.x + dx, y: p.orig.y + dy })
                }
              }}
              onPointerUp={(e) => {
                const p = fabPointer.current
                fabPointer.current = null
                e.currentTarget.releasePointerCapture(e.pointerId)
                if (p && !p.didDrag) {
                  openRequestFromFab()
                }
              }}
              onPointerCancel={(e) => {
                fabPointer.current = null
                e.currentTarget.releasePointerCapture(e.pointerId)
              }}
            >
              <div className={s.requestOpenFabLabel}>{t.fabRequest}</div>
              <span className={s.requestOpenFabHint}>{t.fabDrag}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
