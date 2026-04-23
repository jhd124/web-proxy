import type { OverrideFormState, OverrideRule } from '../../../types'
import { overrideEditorTexts } from '../texts'
import type { SetOverrideForm } from '../types'
import s from './OverrideFilesUI.module.css'

const tf = overrideEditorTexts.files

type Props = {
  overrideFileInputRef: React.RefObject<HTMLInputElement | null>
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
  overrideEntries: OverrideRule[]
  startNewOverride: () => void
  openOverrideEditorForKey: (override: OverrideRule) => void
  onAddBreakpointClick: (override: OverrideRule) => void
  overrideBodyDrafts: Record<string, string>
  setOverrideBodyDrafts: React.Dispatch<
    React.SetStateAction<Record<string, string>>
  >
  overrideBodySaving: Record<string, boolean>
  overrideToggleSaving: Record<string, boolean>
  setOverrideEnabled: (override: OverrideRule, enabled: boolean) => void
  saveOverrideBody: (override: OverrideRule) => void
  deleteOverrideRule: (id: string) => Promise<void>
}

export function OverrideFilesUI({
  overrideFileInputRef,
  overrideForm,
  setOverrideForm,
  overrideEntries,
  startNewOverride,
  openOverrideEditorForKey,
  onAddBreakpointClick,
  overrideBodyDrafts,
  setOverrideBodyDrafts,
  overrideBodySaving,
  overrideToggleSaving,
  setOverrideEnabled,
  saveOverrideBody,
  deleteOverrideRule,
}: Props) {
  return (
    <div className={`${s.fileManager} ${s.fileManagerEmbed}`}>
      <button
        type="button"
        className={`ghost ${s.newOverrideBtn}`}
        onClick={startNewOverride}
      >
        {tf.newRule}
      </button>
      <p className="small muted">{tf.importHint}</p>
      <input
        ref={overrideFileInputRef}
        type="file"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (!f) return
          const reader = new FileReader()
          reader.onload = () => {
            setOverrideForm((x) => ({
              ...x,
              body: String(reader.result ?? ''),
            }))
          }
          reader.readAsText(f)
          e.target.value = ''
        }}
      />
      <div className={s.fileManagerActions}>
        <button
          type="button"
          className="ghost"
          onClick={() => overrideFileInputRef.current?.click()}
        >
          {tf.importToBody}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => {
            const blob = new Blob([overrideForm.body], { type: 'text/plain' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'override-response-body.txt'
            a.click()
            URL.revokeObjectURL(a.href)
          }}
        >
          {tf.exportBody}
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => setOverrideForm((f) => ({ ...f, body: '' }))}
        >
          {tf.clearBody}
        </button>
      </div>
      <div className={s.fileManagerSep} aria-hidden="true" />
      <p className={`small muted ${s.fileManagerListIntro}`}>
        {tf.listIntroLead}{' '}
        <strong>Traffic → Override response</strong>
        {tf.listIntroOr} <strong>New rule</strong> {tf.listIntroAbove}{' '}
        <strong>Request</strong> {tf.listIntroTail}
      </p>
      {overrideEntries.length === 0 ? (
        <p className="small muted" style={{ margin: '0.15rem 0' }}>
          {tf.noRulesLead} <strong>{tf.newRule}</strong> {tf.noRulesTail}
        </p>
      ) : (
        <ul className={s.embedMockList}>
          {overrideEntries.map((override) => (
            <li
              key={override.id}
              className={`${s.card} ${!override.enabled ? s.cardDisabled : ''}`}
            >
              <div className={s.head}>
                <strong>
                  {override.name}{' '}
                  {!override.enabled && (
                    <span className="pill subtle">{tf.disabled}</span>
                  )}
                </strong>
                <div className={s.actions}>
                  <button
                    type="button"
                    className="ghost"
                    disabled={overrideToggleSaving[override.id] === true}
                    onClick={() => void setOverrideEnabled(override, !override.enabled)}
                  >
                    {overrideToggleSaving[override.id]
                      ? tf.saving
                      : override.enabled
                        ? tf.disable
                        : tf.enable}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => openOverrideEditorForKey(override)}
                  >
                    {tf.edit}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onAddBreakpointClick(override)}
                  >
                    {tf.addBreakpoint}
                  </button>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => {
                      if (!window.confirm(tf.deleteRuleConfirm)) {
                        return
                      }
                      void deleteOverrideRule(override.id).catch((e) => {
                        window.alert(String(e))
                      })
                    }}
                  >
                    {tf.deleteRule}
                  </button>
                </div>
              </div>
              <p className={`small mono ${s.overrideSig}`}>
                <span className={s.tagSig}>{override.matchMethod ?? '∗'}</span>{' '}
                {override.matchHost ?? '∗'}
                <span className={s.pathSig}>{override.matchPathRegex ?? '∗'}</span>
              </p>
              <p className="tiny muted">
                {tf.overrideId} <code>{override.id}</code>
              </p>
              <p className="small mono">{tf.httpStatus(override.status)}</p>
              {override.streamIntervalMs != null && (
                <p className="tiny muted">
                  {tf.streamed(override.streamIntervalMs)}
                </p>
              )}
              <label className={s.bodyEditor}>
                <span className="tiny muted">
                  {override.streamIntervalMs != null
                    ? tf.streamBodyLabel
                    : tf.responseBodyLabel}
                </span>
                <textarea
                  rows={Math.max(
                    4,
                    Math.min(
                      10,
                      (overrideBodyDrafts[override.id] ?? override.body).split('\n')
                        .length + 1,
                    ),
                  )}
                  className="mono"
                  spellCheck={false}
                  value={overrideBodyDrafts[override.id] ?? override.body}
                  onChange={(e) =>
                    setOverrideBodyDrafts((prev) => ({
                      ...prev,
                      [override.id]: e.target.value,
                    }))
                  }
                />
              </label>
              <div className={s.inlineActions}>
                <button
                  type="button"
                  className="ghost"
                  disabled={
                    overrideBodySaving[override.id] === true ||
                    overrideToggleSaving[override.id] === true ||
                    (overrideBodyDrafts[override.id] ?? override.body) ===
                      override.body
                  }
                  onClick={() =>
                    setOverrideBodyDrafts((prev) => ({
                      ...prev,
                      [override.id]: override.body,
                    }))
                  }
                >
                  {tf.reset}
                </button>
                <button
                  type="button"
                  className={`primary ${s.inlinePrimary}`}
                  disabled={
                    overrideBodySaving[override.id] === true ||
                    overrideToggleSaving[override.id] === true
                  }
                  onClick={() => void saveOverrideBody(override)}
                >
                  {overrideBodySaving[override.id] ? tf.saving : tf.saveContent}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
