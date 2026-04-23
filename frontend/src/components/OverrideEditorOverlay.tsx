import type { RefObject } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { OverrideFormState, OverrideRule, TrafficEntry } from '../types'
import { urlOrigin } from '../lib/dashboardUtils'
import { OverrideFilesPanel } from './OverrideFilesPanel'
import { OverrideMonacoPane } from './OverrideMonacoPane'
import { OverrideRequestForm } from './OverrideRequestForm'

type SetOverrideForm = Dispatch<SetStateAction<OverrideFormState>>

type AddBreakpointFromOverride = (
  source: {
    name: string
    matchHost?: string | null
    matchPathRegex?: string | null
  },
  originHint?: string,
) => void

type Props = {
  closeOverrideDrawer: () => void
  saveOverride: () => void
  overrideError: string | null
  overrideLeftTool: 'files' | 'info'
  setOverrideLeftTool: (t: 'files' | 'info') => void
  overrideFileInputRef: RefObject<HTMLInputElement | null>
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
  overrideEntries: OverrideRule[]
  startNewOverride: () => void
  openOverrideEditorForKey: (override: OverrideRule) => void
  onAddBreakpointForListOverride: (override: OverrideRule) => void
  overrideBodyDrafts: Record<string, string>
  setOverrideBodyDrafts: Dispatch<SetStateAction<Record<string, string>>>
  overrideBodySaving: Record<string, boolean>
  overrideToggleSaving: Record<string, boolean>
  setOverrideEnabled: (override: OverrideRule, enabled: boolean) => void
  saveOverrideBody: (override: OverrideRule) => void
  deleteOverrideRule: (id: string) => Promise<void>
  selected: TrafficEntry | null
  selectedMatchingOverride: OverrideRule | null
  overrideEditingId: string | null
  selectedCanControlStream: boolean
  resumeRequest: (id: string) => void
  resumeSaving: Record<string, boolean>
  addBreakpointFromOverride: AddBreakpointFromOverride
  streamActionSaving: Record<string, boolean>
  playControlledStream: (id: string) => void
  pauseControlledStream: (id: string) => void
}

export function OverrideEditorOverlay({
  closeOverrideDrawer,
  saveOverride,
  overrideError,
  overrideLeftTool,
  setOverrideLeftTool,
  overrideFileInputRef,
  overrideForm,
  setOverrideForm,
  overrideEntries,
  startNewOverride,
  openOverrideEditorForKey,
  onAddBreakpointForListOverride,
  overrideBodyDrafts,
  setOverrideBodyDrafts,
  overrideBodySaving,
  overrideToggleSaving,
  setOverrideEnabled,
  saveOverrideBody,
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
}: Props) {
  return (
    <div
      className="override-fs-backdrop"
      role="presentation"
      onClick={closeOverrideDrawer}
    >
      <div
        className="override-fs"
        role="dialog"
        aria-modal="true"
        aria-labelledby="override-fs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="override-fs-head">
          <div>
            <h2 id="override-fs-title">Override response</h2>
            <p className="small muted" style={{ margin: '0.15rem 0 0' }}>
              Future requests that match the rule receive this response (plain HTTP; first
              mock wins).
            </p>
          </div>
          <button
            type="button"
            className="ghost drawer-close"
            onClick={closeOverrideDrawer}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {overrideError && (
          <p className="small err override-fs-err">{overrideError}</p>
        )}
        <div className="override-fs-body">
          <aside className="override-tool-col">
            <div className="override-tool-tabs" role="tablist">
              <button
                type="button"
                className={overrideLeftTool === 'files' ? 'on' : ''}
                onClick={() => setOverrideLeftTool('files')}
              >
                Files
              </button>
              <button
                type="button"
                className={overrideLeftTool === 'info' ? 'on' : ''}
                onClick={() => setOverrideLeftTool('info')}
              >
                Request
              </button>
            </div>
            <div className="override-tool-body">
              {overrideLeftTool === 'files' && (
                <OverrideFilesPanel
                  overrideFileInputRef={overrideFileInputRef}
                  overrideForm={overrideForm}
                  setOverrideForm={setOverrideForm}
                  overrideEntries={overrideEntries}
                  startNewOverride={startNewOverride}
                  openOverrideEditorForKey={openOverrideEditorForKey}
                  onAddBreakpointClick={onAddBreakpointForListOverride}
                  overrideBodyDrafts={overrideBodyDrafts}
                  setOverrideBodyDrafts={setOverrideBodyDrafts}
                  overrideBodySaving={overrideBodySaving}
                  overrideToggleSaving={overrideToggleSaving}
                  setOverrideEnabled={setOverrideEnabled}
                  saveOverrideBody={saveOverrideBody}
                  deleteOverrideRule={deleteOverrideRule}
                />
              )}
              {overrideLeftTool === 'info' && (
                <OverrideRequestForm
                  overrideForm={overrideForm}
                  setOverrideForm={setOverrideForm}
                  selectedCanControlStream={selectedCanControlStream}
                  selected={selected}
                  streamActionSaving={streamActionSaving}
                  playControlledStream={playControlledStream}
                  pauseControlledStream={pauseControlledStream}
                />
              )}
            </div>
          </aside>
          <OverrideMonacoPane
            overrideEditingId={overrideEditingId}
            overrideForm={overrideForm}
            setOverrideForm={setOverrideForm}
          />
        </div>
        <div className="drawer-actions override-fs-foot">
          {selected?.pending && selectedMatchingOverride?.id === overrideEditingId && (
            <button
              type="button"
              className="primary inline-primary"
              disabled={resumeSaving[selected.id] === true}
              onClick={() => void resumeRequest(selected.id)}
            >
              {resumeSaving[selected.id] ? 'Resuming…' : 'Resume request'}
            </button>
          )}
          <button
            type="button"
            className="ghost"
            onClick={() =>
              void addBreakpointFromOverride(
                {
                  name: overrideForm.name.trim() || 'Override',
                  matchHost: overrideForm.matchHost || null,
                  matchPathRegex: overrideForm.matchPathRegex || null,
                },
                selectedMatchingOverride?.id === overrideEditingId && selected
                  ? urlOrigin(selected.url)
                  : undefined,
              )
            }
          >
            Add breakpoint
          </button>
          <button type="button" className="ghost" onClick={closeOverrideDrawer}>
            Cancel
          </button>
          <button type="button" className="primary" onClick={saveOverride}>
            {overrideEditingId ? 'Save changes' : 'Save override'}
          </button>
        </div>
      </div>
    </div>
  )
}
