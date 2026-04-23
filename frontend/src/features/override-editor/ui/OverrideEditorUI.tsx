import { urlOrigin } from '../../../lib/dashboardUtils'
import { overrideEditorTexts } from '../texts'
import type { OverrideEditorUIProps } from '../types'
import { OverrideFilesUI } from './OverrideFilesUI'
import { OverrideMonacoUI } from './OverrideMonacoUI'
import { OverrideRequestFormUI } from './OverrideRequestFormUI'
import s from './OverrideEditorUI.module.css'

const t = overrideEditorTexts.shell
const of = overrideEditorTexts.form

export function OverrideEditorUI({
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
}: OverrideEditorUIProps) {
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
        <div className={s.fsBody}>
          <aside className={s.toolCol}>
            <div className={s.toolTabs} role="tablist">
              <button
                type="button"
                className={`${s.toolTab} ${
                  overrideLeftTool === 'files' ? s.toolTabOn : ''
                }`}
                onClick={() => setOverrideLeftTool('files')}
              >
                {t.tabFiles}
              </button>
              <button
                type="button"
                className={`${s.toolTab} ${
                  overrideLeftTool === 'info' ? s.toolTabOn : ''
                }`}
                onClick={() => setOverrideLeftTool('info')}
              >
                {t.tabRequest}
              </button>
            </div>
            <div className={s.toolBody}>
              {overrideLeftTool === 'files' && (
                <OverrideFilesUI
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
                <OverrideRequestFormUI
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
          <OverrideMonacoUI
            overrideEditingId={overrideEditingId}
            overrideForm={overrideForm}
            setOverrideForm={setOverrideForm}
          />
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
                  name: overrideForm.name.trim() || of.defaultOverrideName,
                  matchHost: overrideForm.matchHost || null,
                  matchPathRegex: overrideForm.matchPathRegex || null,
                },
                selectedMatchingOverride?.id === overrideEditingId && selected
                  ? urlOrigin(selected.url)
                  : undefined,
              )
            }
          >
            {t.footAddBreakpoint}
          </button>
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
