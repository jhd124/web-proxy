import { useEffect, useMemo } from 'react'
import { FilePlusCorner, Save, StepForward, Trash2 } from 'lucide-react'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { LEFT_LIST_PANEL_DEFAULT_SIZE } from '@/lib/panelLayout'
import { HostGroupList } from '@/components/host-group-list/HostGroupList'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
const METHOD_ANY_VALUE = '__ANY_METHOD__'
const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']

export function BreakpointsPanelUI({
  closeBreakpointsPanel,
  variant = 'dialog',
  breakpointForm,
  setBreakpointForm,
  breakpointEntries,
  pendingRequestIdByBreakpointId,
  resumeRequest,
  resumeSaving,
  isBreakpointFormActive,
  selectedBreakpointId,
  setSelectedBreakpointId,
  startNewBreakpoint,
  saveBreakpoint,
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

  const hasUnsavedChanges = useMemo(() => {
    if (!selectedBreakpoint && !isBreakpointFormActive) {
      return false
    }
    const normalizedCurrent = normalizeBreakpointForm({
      name: breakpointForm.name,
      matchMethod: breakpointForm.matchMethod,
      matchOrigin: breakpointForm.matchOrigin,
      matchPathRegex: breakpointForm.matchPathRegex,
    })

    if (selectedBreakpoint) {
      const normalizedSelected = normalizeBreakpointForm({
        name: selectedBreakpoint.name,
        matchMethod: selectedBreakpoint.matchMethod ?? '',
        matchOrigin: selectedBreakpoint.matchOrigin ?? '',
        matchPathRegex: selectedBreakpoint.matchPathRegex ?? '',
      })
      return (
        normalizedCurrent.name !== normalizedSelected.name ||
        normalizedCurrent.matchMethod !== normalizedSelected.matchMethod ||
        normalizedCurrent.matchOrigin !== normalizedSelected.matchOrigin ||
        normalizedCurrent.matchPathRegex !== normalizedSelected.matchPathRegex
      )
    }

    const normalizedDefault = normalizeBreakpointForm({
      name: t.defaultFormName,
      matchMethod: 'GET',
      matchOrigin: '',
      matchPathRegex: t.defaultPathRegex,
    })
    return (
      normalizedCurrent.name !== normalizedDefault.name ||
      normalizedCurrent.matchMethod !== normalizedDefault.matchMethod ||
      normalizedCurrent.matchOrigin !== normalizedDefault.matchOrigin ||
      normalizedCurrent.matchPathRegex !== normalizedDefault.matchPathRegex
    )
  }, [breakpointForm, isBreakpointFormActive, selectedBreakpoint])

  const canSaveBreakpoint = selectedBreakpoint != null || isBreakpointFormActive

  useEffect(() => {
    if (!highlightedBreakpointId) return
    setSelectedBreakpointId(highlightedBreakpointId)
  }, [highlightedBreakpointId, setSelectedBreakpointId])

  useEffect(() => {
    if (!selectedBreakpoint) return
    setBreakpointForm({
      name: selectedBreakpoint.name,
      matchMethod: selectedBreakpoint.matchMethod ?? '',
      matchOrigin: selectedBreakpoint.matchOrigin ?? '',
      matchPathRegex: selectedBreakpoint.matchPathRegex ?? '',
    })
  }, [selectedBreakpoint, setBreakpointForm])

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      const isSaveShortcut =
        (event.metaKey || event.ctrlKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === 's'
      if (!isSaveShortcut) return
      event.preventDefault()
      void saveBreakpoint(selectedRequestOrigin)
    }

    window.addEventListener('keydown', handleSaveShortcut, { capture: true })
    return () => {
      window.removeEventListener('keydown', handleSaveShortcut, {
        capture: true,
      })
    }
  }, [saveBreakpoint, selectedRequestOrigin])

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
      <TooltipButton
        type="button"
        className={`${hasUnsavedChanges ? 'primary' : 'ghost'} ${s.actionIconBtn}`}
        disabled={!canSaveBreakpoint}
        onClick={() => void saveBreakpoint(selectedRequestOrigin)}
        aria-label={selectedBreakpoint ? t.saveChanges : t.add}
        tooltip={selectedBreakpoint ? t.saveChanges : t.add}
      >
        <Save size={16} aria-hidden />
      </TooltipButton>
      {selectedBreakpoint ? (
        <>
          {(() => {
            const pendingRequestId =
              pendingRequestIdByBreakpointId.get(selectedBreakpoint.id) ?? null
            if (!pendingRequestId) return null
            return (
              <TooltipButton
                type="button"
                className={`primary inline-primary ${s.actionIconBtn}`}
                disabled={resumeSaving[pendingRequestId] === true}
                aria-label={t.continueAllFromBreakpoint}
                tooltip={t.continueAllFromBreakpoint}
                onClick={() => void resumeRequest(pendingRequestId)}
              >
                <StepForward size={16} aria-hidden />
              </TooltipButton>
            )
          })()}
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
      ) : null}
    </>
  )

  const renderItem = (rule: BreakpointRule) => {
    const isActive = selectedBreakpoint?.id === rule.id
    const pendingRequestId = pendingRequestIdByBreakpointId.get(rule.id) ?? null
    return (
      <div className={s.itemRow}>
        <button
          type="button"
          className={`${s.itemButton} ${isActive ? s.itemButtonActive : ''}`}
          onClick={() => setSelectedBreakpointId(rule.id)}
          data-breakpoint-id={rule.id}
        >
          <span
            className={`${s.stateDot} ${
              pendingRequestId
                ? s.stateDotDisabled
                : rule.enabled
                  ? s.stateDotEnabled
                  : ''
            }`}
            aria-hidden
          />
          <span className={s.itemName}>{rule.name}</span>
        </button>
        {pendingRequestId ? (
          <TooltipButton
            type="button"
            className={`primary inline-primary ${s.itemContinueBtn}`}
            disabled={resumeSaving[pendingRequestId] === true}
            aria-label={t.continueRequest}
            tooltip={t.continueRequest}
            onClick={() => void resumeRequest(pendingRequestId)}
          >
            <StepForward size={14} aria-hidden />
          </TooltipButton>
        ) : null}
      </div>
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
                      isGroupAlert={(group) =>
                        group.items.some((rule) =>
                          pendingRequestIdByBreakpointId.has(rule.id),
                        )
                      }
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
                {selectedBreakpoint || isBreakpointFormActive ? (
                  <BreakpointForm
                    breakpointForm={breakpointForm}
                    setBreakpointForm={setBreakpointForm}
                    selectedBreakpoint={selectedBreakpoint}
                  />
                ) : (
                  <div className={s.emptyDetail}>
                    <p className="muted">{t.selectHint}</p>
                  </div>
                )}
              </main>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  )
}

function normalizeBreakpointForm(form: {
  name: string
  matchMethod: string
  matchOrigin: string
  matchPathRegex: string
}) {
  return {
    name: form.name.trim(),
    matchMethod: form.matchMethod.trim().toUpperCase(),
    matchOrigin: form.matchOrigin.trim(),
    matchPathRegex: form.matchPathRegex.trim(),
  }
}

function BreakpointForm({
  breakpointForm,
  setBreakpointForm,
  selectedBreakpoint,
}: Pick<BreakpointsPanelUIProps, 'breakpointForm' | 'setBreakpointForm'> & {
  selectedBreakpoint: BreakpointRule | null
}) {
  return (
    <>
      <div className={s.detailHead}>
        <div>
          <h3>{selectedBreakpoint ? t.detailTitle : t.newTitle}</h3>
          {selectedBreakpoint && !selectedBreakpoint.enabled && (
            <span className="pill subtle">{t.disabledPill}</span>
          )}
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
          <Select
            value={breakpointForm.matchMethod || METHOD_ANY_VALUE}
            onValueChange={(value) =>
              setBreakpointForm((f) => ({
                ...f,
                matchMethod: value === METHOD_ANY_VALUE ? '' : value,
              }))
            }
          >
            <SelectTrigger className="mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={METHOD_ANY_VALUE}>ANY</SelectItem>
              {METHOD_OPTIONS.map((method) => (
                <SelectItem key={method} value={method}>
                  {method}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        <div className="small muted">{t.saveHint}</div>
      </div>
    </>
  )
}
