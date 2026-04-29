import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { usePanelRef, type PanelSize } from 'react-resizable-panels'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { isDefaultOverrideForm, urlOrigin } from '../../../lib/dashboardUtils'
import { overrideEditorTexts } from '../texts'
import type { OverrideEditorUIProps } from '../types'
import { OverrideFilesUI } from './OverrideFilesUI'
import { OverrideMonacoUI } from './OverrideMonacoUI'
import { OverrideRequestFormUI } from './OverrideRequestFormUI'
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

export function OverrideEditorUI({
  closeOverrideDrawer,
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

  const openRequestFromFab = () => {
    requestPanelRef.current?.resize(REQUEST_PCT)
  }

  const editingRule = overrideEditingId
    ? (overrideEntries.find((r) => r.id === overrideEditingId) ?? null)
    : null

  return (
    <div
      className={s.fsBackdrop}
      role="presentation"
      onClick={closeOverrideDrawer}
    >
      <div
        className={s.fs}
        role="dialog"
        aria-modal="true"
        aria-labelledby="override-fs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={s.fsHead}>
          <div>
            <h2 id="override-fs-title">{t.title}</h2>
            <p className="small muted" style={{ margin: '0.15rem 0 0' }}>
              {t.subtitle}
            </p>
          </div>
          <button
            type="button"
            className={`ghost ${s.drawerClose}`}
            onClick={closeOverrideDrawer}
            aria-label={t.closeAria}
          >
            ×
          </button>
        </div>
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
              defaultSize={380}
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
                    startNewOverride={startNewOverride}
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
              defaultSize="52%"
              id="override-monaco"
              minSize={28}
            >
              <OverrideMonacoUI
                overrideEditingId={overrideEditingId}
                overrideForm={overrideForm}
                setOverrideForm={setOverrideForm}
              />
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
                  computedOverrideId={computedOverrideId}
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
        <div className={s.foot}>
          {selected?.pending &&
            selectedMatchingOverride?.id === overrideEditingId && (
              <button
                type="button"
                className="primary inline-primary"
                disabled={resumeSaving[selected.id] === true}
                onClick={() => void resumeRequest(selected.id)}
              >
                {resumeSaving[selected.id] ? t.footResuming : t.footResumeRequest}
              </button>
            )}
          <button
            type="button"
            className="ghost"
            onClick={() =>
              void addBreakpointFromOverride(
                {
                  name:
                    [overrideForm.matchHost, overrideForm.matchPath]
                      .map((x) => (x ?? '').trim())
                      .filter(Boolean)
                      .join(' ') || 'Override',
                  matchHost: overrideForm.matchHost || null,
                  matchPath: overrideForm.matchPath || null,
                },
                selectedMatchingOverride?.id === overrideEditingId && selected
                  ? urlOrigin(selected.url)
                  : undefined,
              )
            }
          >
            {t.footAddBreakpoint}
          </button>
          {editingRule && (
            <>
              <button
                type="button"
                className="ghost"
                disabled={overrideToggleSaving[editingRule.id] === true}
                onClick={() =>
                  void setOverrideEnabled(editingRule, !editingRule.enabled)
                }
              >
                {overrideToggleSaving[editingRule.id] === true
                  ? tf.saving
                  : editingRule.enabled
                    ? tf.disable
                    : tf.enable}
              </button>
              <button
                type="button"
                className="ghost danger"
                onClick={() => {
                  if (!window.confirm(tf.deleteRuleConfirm)) {
                    return
                  }
                  void deleteOverrideRule(editingRule.id)
                    .then(() => {
                      startNewOverride()
                    })
                    .catch((e) => {
                      window.alert(String(e))
                    })
                }}
              >
                {tf.deleteRule}
              </button>
            </>
          )}
          <button type="button" className="ghost" onClick={closeOverrideDrawer}>
            {t.footCancel}
          </button>
          <button type="button" className="primary" onClick={saveOverride}>
            {overrideEditingId ? t.saveChanges : t.saveOverride}
          </button>
        </div>
      </div>
    </div>
  )
}
