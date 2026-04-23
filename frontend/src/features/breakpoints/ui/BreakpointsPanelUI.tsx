import { breakpointTexts } from '../texts'
import type { BreakpointsPanelUIProps } from '../types'
import s from './BreakpointsPanelUI.module.css'

export function BreakpointsPanelUI({
  breakpointForm,
  setBreakpointForm,
  breakpointEntries,
  addBreakpoint,
  removeBreakpoint,
  setBreakpointEnabled,
  breakpointToggleSaving,
}: BreakpointsPanelUIProps) {
  const t = breakpointTexts
  return (
    <div className={s.root}>
      <p className={`muted ${s.intro}`}>{t.intro}</p>

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
        <label className={s.wide}>
          {t.originLabel}
          <input
            className="mono"
            placeholder={t.originPlaceholder}
            value={breakpointForm.matchOrigin}
            onChange={(e) =>
              setBreakpointForm((f) => ({
                ...f,
                matchOrigin: e.target.value,
              }))
            }
          />
        </label>
        <label className={s.wide}>
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
        <button
          type="button"
          className={`primary ${s.addBtn}`}
          onClick={addBreakpoint}
        >
          {t.add}
        </button>
      </div>

      {breakpointEntries.length === 0 ? (
        <p className="muted">{t.noneYet}</p>
      ) : (
        <ul className={s.list}>
          {breakpointEntries.map((rule) => (
            <li
              key={rule.id}
              className={`${s.card} ${rule.enabled ? '' : s.cardDisabled}`}
            >
              <div className={s.head}>
                <strong>
                  {rule.name}{' '}
                  {!rule.enabled && (
                    <span className="pill subtle">{t.disabledPill}</span>
                  )}
                </strong>
                <div className={s.actions}>
                  <button
                    type="button"
                    className="ghost"
                    disabled={breakpointToggleSaving[rule.id] === true}
                    onClick={() => void setBreakpointEnabled(rule, !rule.enabled)}
                  >
                    {breakpointToggleSaving[rule.id]
                      ? t.saving
                      : rule.enabled
                        ? t.disable
                        : t.enable}
                  </button>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => {
                      if (!window.confirm(t.deleteConfirm)) {
                        return
                      }
                      void removeBreakpoint(rule.id).catch((e) => {
                        window.alert(String(e))
                      })
                    }}
                  >
                    {t.delete}
                  </button>
                </div>
              </div>
              <p className={`small mono ${s.ruleBody}`}>
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
