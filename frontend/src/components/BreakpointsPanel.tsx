import type { Dispatch, SetStateAction } from 'react'
import type { BreakpointRule } from '../types'

type BreakpointForm = {
  name: string
  matchOrigin: string
  matchPathRegex: string
}

type SetBreakpointForm = Dispatch<SetStateAction<BreakpointForm>>

type Props = {
  breakpointForm: BreakpointForm
  setBreakpointForm: SetBreakpointForm
  breakpointEntries: BreakpointRule[]
  addBreakpoint: () => void
  removeBreakpoint: (id: string) => Promise<void>
  setBreakpointEnabled: (rule: BreakpointRule, enabled: boolean) => void
  breakpointToggleSaving: Record<string, boolean>
}

export function BreakpointsPanel({
  breakpointForm,
  setBreakpointForm,
  breakpointEntries,
  addBreakpoint,
  removeBreakpoint,
  setBreakpointEnabled,
  breakpointToggleSaving,
}: Props) {
  return (
    <div className="mocks">
      <p className="muted intro">
        Breakpoints pause matching HTTP requests before overrides, mocks, or upstream
        fetches. When a request is pending, resume it from the request detail view or from
        the Overrides response editor.
      </p>

      <div className="mock-form">
        <label>
          Name
          <input
            value={breakpointForm.name}
            onChange={(e) =>
              setBreakpointForm((f) => ({ ...f, name: e.target.value }))
            }
          />
        </label>
        <label className="wide">
          Origin
          <input
            className="mono"
            placeholder="https://example.com"
            value={breakpointForm.matchOrigin}
            onChange={(e) =>
              setBreakpointForm((f) => ({
                ...f,
                matchOrigin: e.target.value,
              }))
            }
          />
        </label>
        <label className="wide">
          Path regex
          <input
            className="mono"
            placeholder="^/api/"
            value={breakpointForm.matchPathRegex}
            onChange={(e) =>
              setBreakpointForm((f) => ({
                ...f,
                matchPathRegex: e.target.value,
              }))
            }
          />
        </label>
        <button type="button" className="primary" onClick={addBreakpoint}>
          Add breakpoint
        </button>
      </div>

      {breakpointEntries.length === 0 ? (
        <p className="muted">No breakpoints yet.</p>
      ) : (
        <ul className="mock-list">
          {breakpointEntries.map((rule) => (
            <li
              key={rule.id}
              className={`mock-card ${rule.enabled ? '' : 'is-disabled'}`}
            >
              <div className="mock-head">
                <strong>
                  {rule.name}{' '}
                  {!rule.enabled && <span className="pill subtle">disabled</span>}
                </strong>
                <div className="override-actions">
                  <button
                    type="button"
                    className="ghost"
                    disabled={breakpointToggleSaving[rule.id] === true}
                    onClick={() => void setBreakpointEnabled(rule, !rule.enabled)}
                  >
                    {breakpointToggleSaving[rule.id]
                      ? 'Saving…'
                      : rule.enabled
                        ? 'Disable'
                        : 'Enable'}
                  </button>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => {
                      if (!window.confirm('Delete this breakpoint rule?')) {
                        return
                      }
                      void removeBreakpoint(rule.id).catch((e) => {
                        window.alert(String(e))
                      })
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="small mono">
                {rule.matchOrigin ?? '∗'}
                <br />
                {rule.matchPathRegex ?? '∗'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
