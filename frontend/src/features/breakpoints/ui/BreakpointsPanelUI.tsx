import { breakpointTexts } from '../texts'
import type { BreakpointsPanelUIProps } from '../types'
import { ConfirmCancelledError, confirm } from '../../../lib/confirm'
import { showToast } from '../../../lib/toast'
import { useEffect } from 'react'
import o from './BreakpointsPanelUI.overlay.module.css'
import s from './BreakpointsPanelUI.module.css'

export function BreakpointsPanelUI({
  closeBreakpointsPanel,
  breakpointForm,
  setBreakpointForm,
  breakpointEntries,
  addBreakpoint,
  removeBreakpoint,
  setBreakpointEnabled,
  breakpointToggleSaving,
  highlightedBreakpointId,
}: BreakpointsPanelUIProps) {
  const t = breakpointTexts
  const sh = t.shell

  useEffect(() => {
    if (!highlightedBreakpointId) return
    const targetElement = document.querySelector<HTMLElement>(
      `[data-breakpoint-id="${highlightedBreakpointId}"]`,
    )
    targetElement?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightedBreakpointId])

  return (
    <div
      className={o.fsBackdrop}
      role="presentation"
      onClick={closeBreakpointsPanel}
    >
      <div
        className={o.fs}
        role="dialog"
        aria-modal="true"
        aria-labelledby="breakpoint-fs-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={o.fsHead}>
          <div>
            <h2 id="breakpoint-fs-title">{sh.title}</h2>
            <p className={`small muted`} style={{ margin: '0.15rem 0 0' }}>
              {sh.subtitle}
            </p>
          </div>
          <button
            type="button"
            className={`ghost ${o.drawerClose}`}
            onClick={closeBreakpointsPanel}
            aria-label={sh.closeAria}
          >
            ×
          </button>
        </div>
        <div className={o.fsBody}>
          <div className={s.root}>
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
                    className={`${s.card} ${rule.enabled ? '' : s.cardDisabled} ${
                      highlightedBreakpointId === rule.id ? s.cardHighlighted : ''
                    }`}
                    data-breakpoint-id={rule.id}
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
                          onClick={() =>
                            void setBreakpointEnabled(rule, !rule.enabled)
                          }
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
                          onClick={async () => {
                            try {
                              await confirm({
                                title: t.delete,
                                description: t.deleteConfirm,
                                confirmLabel: t.delete,
                              })
                              await removeBreakpoint(rule.id)
                            } catch (e) {
                              if (e instanceof ConfirmCancelledError) return
                              showToast(String(e), 'error')
                            }
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
        </div>
      </div>
    </div>
  )
}
