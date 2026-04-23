import type { RefObject } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { OverrideFormState, OverrideRule } from '../types'

type SetOverrideForm = Dispatch<SetStateAction<OverrideFormState>>

type Props = {
  overrideFileInputRef: RefObject<HTMLInputElement | null>
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
  overrideEntries: OverrideRule[]
  startNewOverride: () => void
  openOverrideEditorForKey: (override: OverrideRule) => void
  onAddBreakpointClick: (override: OverrideRule) => void
  overrideBodyDrafts: Record<string, string>
  setOverrideBodyDrafts: Dispatch<SetStateAction<Record<string, string>>>
  overrideBodySaving: Record<string, boolean>
  overrideToggleSaving: Record<string, boolean>
  setOverrideEnabled: (override: OverrideRule, enabled: boolean) => void
  saveOverrideBody: (override: OverrideRule) => void
  deleteOverrideRule: (id: string) => Promise<void>
}

export function OverrideFilesPanel({
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
    <div className="file-manager file-manager-embed">
      <button
        type="button"
        className="ghost new-override-btn"
        onClick={startNewOverride}
      >
        New rule
      </button>
      <p className="small muted">
        Body import/export applies to the <strong>rule you are editing</strong> in this
        session (right pane), not a row below until you use Edit.
      </p>
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
      <div className="file-manager-actions">
        <button
          type="button"
          className="ghost"
          onClick={() => overrideFileInputRef.current?.click()}
        >
          Import to body
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
          Export body
        </button>
        <button
          type="button"
          className="ghost"
          onClick={() => setOverrideForm((f) => ({ ...f, body: '' }))}
        >
          Clear body
        </button>
      </div>
      <div className="file-manager-sep" aria-hidden="true" />
      <p className="small muted file-manager-list-intro">
        Rule list (SQLite, applied before mock rules). You can also add a rule from{' '}
        <strong>Traffic → Override response</strong>, or <strong>New rule</strong> above,
        then use <strong>Request</strong> to fill match and body.
      </p>
      {overrideEntries.length === 0 ? (
        <p className="small muted" style={{ margin: '0.15rem 0' }}>
          No rules yet. Use <strong>New rule</strong> or open one from captured traffic.
        </p>
      ) : (
        <ul className="mock-list override-embed-mock-list">
          {overrideEntries.map((override) => (
            <li
              key={override.id}
              className={`mock-card ${override.enabled ? '' : 'is-disabled'}`}
            >
              <div className="mock-head">
                <strong>
                  {override.name}{' '}
                  {!override.enabled && <span className="pill subtle">disabled</span>}
                </strong>
                <div className="override-actions">
                  <button
                    type="button"
                    className="ghost"
                    disabled={overrideToggleSaving[override.id] === true}
                    onClick={() => void setOverrideEnabled(override, !override.enabled)}
                  >
                    {overrideToggleSaving[override.id]
                      ? 'Saving…'
                      : override.enabled
                        ? 'Disable'
                        : 'Enable'}
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => openOverrideEditorForKey(override)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => onAddBreakpointClick(override)}
                  >
                    Add breakpoint
                  </button>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => {
                      if (!window.confirm('Delete this override from SQLite?')) {
                        return
                      }
                      void deleteOverrideRule(override.id).catch((e) => {
                        window.alert(String(e))
                      })
                    }}
                  >
                    Delete rule
                  </button>
                </div>
              </div>
              <p className="small mono override-sig">
                <span className="tag-sig">{override.matchMethod ?? '∗'}</span>{' '}
                {override.matchHost ?? '∗'}
                <span className="path-sig">{override.matchPathRegex ?? '∗'}</span>
              </p>
              <p className="tiny muted">
                Override id: <code>{override.id}</code>
              </p>
              <p className="small mono">HTTP {override.status}</p>
              {override.streamIntervalMs != null && (
                <p className="tiny muted">
                  Streamed: {override.streamIntervalMs} ms between chunks (body split on
                  blank lines)
                </p>
              )}
              <label className="override-body-editor">
                <span className="tiny muted">
                  {override.streamIntervalMs != null
                    ? 'Stream body content'
                    : 'Response body content'}
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
              <div className="override-inline-actions">
                <button
                  type="button"
                  className="ghost"
                  disabled={
                    overrideBodySaving[override.id] === true ||
                    overrideToggleSaving[override.id] === true ||
                    (overrideBodyDrafts[override.id] ?? override.body) === override.body
                  }
                  onClick={() =>
                    setOverrideBodyDrafts((prev) => ({
                      ...prev,
                      [override.id]: override.body,
                    }))
                  }
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="primary inline-primary"
                  disabled={
                    overrideBodySaving[override.id] === true ||
                    overrideToggleSaving[override.id] === true
                  }
                  onClick={() => void saveOverrideBody(override)}
                >
                  {overrideBodySaving[override.id] ? 'Saving…' : 'Save content'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
