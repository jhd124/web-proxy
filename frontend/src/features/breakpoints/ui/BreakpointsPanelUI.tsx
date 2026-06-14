import { useEffect, useMemo } from 'react'
import { FilePlusCorner, Save, Trash2 } from 'lucide-react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { LEFT_LIST_PANEL_DEFAULT_SIZE } from '@/lib/panelLayout'
import { HostGroupList } from '@/components/host-group-list/HostGroupList'
import { breakpointTexts } from '../texts'
import type { BreakpointsPanelUIProps } from '../types'
import { buildBreakpointGroups } from '../breakpointGroups'
import { ConfirmCancelledError, confirm } from '../../../lib/confirm'
import { showToast } from '../../../lib/toast'
import type { BreakpointRule } from '../../../types'
import { TooltipButton } from '../../override-editor/ui/TooltipButton'
import o from './BreakpointsPanelUI.overlay.module.css'
import s from './BreakpointsPanelUI.module.css'

const t = breakpointTexts
const sh = t.shell

export function BreakpointsPanelUI({
  closeBreakpointsPanel,
  variant = 'dialog',
  breakpointForm,
  setBreakpointForm,
  breakpointEntries,
  selectedBreakpointId,
  setSelectedBreakpointId,
  startNewBreakpoint,
  addBreakpoint,
  selectedRequestOrigin,
  removeBreakpoint,
  setBreakpointEnabled,
  breakpointToggleSaving,
  highlightedBreakpointId,
}: BreakpointsPanelUIProps) {
  const isInline = variant !== 'dialog'
  const inlineClassName = variant === 'sidebar' ? o.sidebarFs : o.embeddedFs

  const groups = useMemo(
    () => buildBreakpointGroups(breakpointEntries),
    [breakpointEntries],
  )

  const selectedBreakpoint = selectedBreakpointId
    ? (breakpointEntries.find((rule) => rule.id === selectedBreakpointId) ??
      null)
    : null

  useEffect(() => {
    if (!highlightedBreakpointId) return
    setSelectedBreakpointId(highlightedBreakpointId)
  }, [highlightedBreakpointId, setSelectedBreakpointId])

  const actionButtons = (
    <>
      <TooltipButton
        type="button"
        className={`ghost ${s.actionIconBtn}`}
        onClick={startNewBreakpoint}
        aria-label={t.newBreakpoint}
        tooltip={t.newBreakpoint}
      >
        <FilePlusCorner size={16} aria-hidden />
      </TooltipButton>
      {!selectedBreakpoint ? (
        <TooltipButton
          type="button"
          className={`primary ${s.actionIconBtn}`}
          onClick={() => addBreakpoint(selectedRequestOrigin)}
          aria-label={t.add}
          tooltip={t.add}
        >
          <Save size={16} aria-hidden />
        </TooltipButton>
      ) : (
        <>
          <TooltipButton
            type="button"
            className={`ghost ${s.actionIconBtn}`}
            disabled={breakpointToggleSaving[selectedBreakpoint.id] === true}
            aria-label={selectedBreakpoint.enabled ? t.disable : t.enable}
            tooltip={
              breakpointToggleSaving[selectedBreakpoint.id] === true
                ? t.saving
                : selectedBreakpoint.enabled
                  ? t.disable
                  : t.enable
            }
            onClick={() =>
              void setBreakpointEnabled(selectedBreakpoint, !selectedBreakpoint.enabled)
            }
          >
            <span
              className={`${s.stateDot} ${
                selectedBreakpoint.enabled ? s.stateDotDisabled : s.stateDotEnabled
              } ${
                breakpointToggleSaving[selectedBreakpoint.id] === true
                  ? s.stateDotSaving
                  : ''
              }`}
              aria-hidden
            />
          </TooltipButton>
          <TooltipButton
            type="button"
            className={`ghost danger ${s.actionIconBtn}`}
            aria-label={t.delete}
            tooltip={t.delete}
            onClick={async () => {
              try {
                await confirm({
                  title: t.delete,
                  description: t.deleteConfirm,
                  confirmLabel: t.delete,
                })
                await removeBreakpoint(selectedBreakpoint.id)
                startNewBreakpoint()
              } catch (e) {
                if (e instanceof ConfirmCancelledError) return
                showToast(String(e), 'error')
              }
            }}
          >
            <Trash2 size={16} aria-hidden />
          </TooltipButton>
        </>
      )}
    </>
  )

  const renderItem = (rule: BreakpointRule) => {
    const isActive = selectedBreakpoint?.id === rule.id
    return (
      <button
        type="button"
        className={`${s.itemButton} ${isActive ? s.itemButtonActive : ''}`}
        onClick={() => setSelectedBreakpointId(rule.id)}
        data-breakpoint-id={rule.id}
      >
        <span
          className={`${s.stateDot} ${rule.enabled ? s.stateDotEnabled : ''}`}
          aria-hidden
        />
        <span className={s.itemName}>{rule.name}</span>
      </button>
    )
  }

  return (
    <div
      className={isInline ? o.sidebarBackdrop : o.fsBackdrop}
      role="presentation"
      onClick={isInline ? undefined : closeBreakpointsPanel}
    >
      <div
        className={`${o.fs} ${isInline ? inlineClassName : ''}`}
        role={isInline ? undefined : 'dialog'}
        aria-modal={isInline ? undefined : 'true'}
        aria-labelledby="breakpoint-fs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={o.fsHead}>
          <div>
            <h2 id="breakpoint-fs-title">{sh.title}</h2>
          </div>
          <div className={o.fsHeadRight}>
            <div className={s.headActions}>{actionButtons}</div>
            {!isInline && (
              <button
                type="button"
                className={`ghost ${o.drawerClose}`}
                onClick={closeBreakpointsPanel}
                aria-label={sh.closeAria}
              >
                ×
              </button>
            )}
          </div>
        </div>
        <div className={o.fsBody}>
          <ResizablePanelGroup
            orientation="horizontal"
            className="min-h-0 min-w-0 flex-1"
            id="breakpoint-panels"
          >
            <ResizablePanel
              className="min-h-0 min-w-0"
              defaultSize={LEFT_LIST_PANEL_DEFAULT_SIZE}
              id="breakpoint-list"
              minSize={16}
            >
              <aside className={s.listPanel}>
                <div className={s.listScroll}>
                  {breakpointEntries.length === 0 ? (
                    <p className={`muted ${s.empty}`}>{t.noneYet}</p>
                  ) : (
                    <HostGroupList
                      groups={groups}
                      idPrefix="breakpoint-origin"
                      getItemKey={(rule) => rule.id}
                      renderItem={renderItem}
                      isGroupActive={(group) =>
                        group.items.some((rule) => rule.enabled)
                      }
                      toggleLabel={t.toggleHostGroup}
                    />
                  )}
                </div>
              </aside>
            </ResizablePanel>
            <ResizableHandle
              withHandle
              className="w-1.5 shrink-0 bg-border/90"
            />
            <ResizablePanel
              className="min-h-0 min-w-0"
              id="breakpoint-detail"
              minSize={28}
            >
              <main className={s.detail}>
                {selectedBreakpoint ? (
                  <BreakpointDetail
                    rule={selectedBreakpoint}
                  />
                ) : (
                  <BreakpointCreateForm
                    breakpointForm={breakpointForm}
                    setBreakpointForm={setBreakpointForm}
                  />
                )}
              </main>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  )
}

function BreakpointDetail({
  rule,
}: {
  rule: BreakpointRule
}) {
  return (
    <>
      <div className={s.detailHead}>
        <div>
          <h3>{rule.name}</h3>
          {!rule.enabled && <span className="pill subtle">{t.disabledPill}</span>}
        </div>
      </div>

      <section className={s.block}>
        <h4>{t.matchSection}</h4>
        <div className={s.matchGrid}>
          <span className={s.matchKey}>{t.methodLabel}</span>
          <span className={s.matchVal}>
            {(rule.matchMethod ?? '').trim() || t.anyValue}
          </span>
          <span className={s.matchKey}>{t.originLabel}</span>
          <span className={s.matchVal}>
            {(rule.matchOrigin ?? '').trim() || t.anyValue}
          </span>
          <span className={s.matchKey}>{t.pathRegexLabel}</span>
          <span className={s.matchVal}>
            {(rule.matchPathRegex ?? '').trim() || t.anyValue}
          </span>
        </div>
      </section>
    </>
  )
}

function BreakpointCreateForm({
  breakpointForm,
  setBreakpointForm,
}: Pick<
  BreakpointsPanelUIProps,
  'breakpointForm' | 'setBreakpointForm'
>) {
  return (
    <>
      <div className={s.detailHead}>
        <div>
          <h3>{t.newTitle}</h3>
        </div>
      </div>
      <div className={s.form}>
        <label>
          {t.nameLabel}
          <input
            value={breakpointForm.name}
            onChange={(e) =>
              setBreakpointForm((f) => ({ ...f, name: e.target.value }))
            }
          />
        </label>
        <label>
          {t.methodLabel}
          <input
            className="mono"
            placeholder={t.methodPlaceholder}
            value={breakpointForm.matchMethod}
            onChange={(e) =>
              setBreakpointForm((f) => ({ ...f, matchMethod: e.target.value }))
            }
          />
        </label>
        <label>
          {t.originLabel}
          <input
            className="mono"
            placeholder={t.originPlaceholder}
            value={breakpointForm.matchOrigin}
            onChange={(e) =>
              setBreakpointForm((f) => ({ ...f, matchOrigin: e.target.value }))
            }
          />
        </label>
        <label>
          {t.pathRegexLabel}
          <input
            className="mono"
            placeholder={t.pathPlaceholder}
            value={breakpointForm.matchPathRegex}
            onChange={(e) =>
              setBreakpointForm((f) => ({
                ...f,
                matchPathRegex: e.target.value,
              }))
            }
          />
        </label>
      </div>
    </>
  )
}
