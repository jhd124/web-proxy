import type { ReactElement } from 'react'
import { FilePenLine, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { PanelHeader, panelHeaderStyles as ph } from '@/components/panel-header'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SimpleTooltip } from '@/components/ui/tooltip'
import { hostsTexts as t } from '../texts'
import type { HostsManagerViewModel } from '../hooks/useHostsManager'
import s from './HostsPanelUI.module.css'

export function HostsPanelUI(viewModel: HostsManagerViewModel): ReactElement {
  const {
    state,
    entries,
    isDirty,
    isLoading,
    isSaving,
    isApplying,
    isReverting,
    addEntry,
    updateEntry,
    removeEntry,
    saveEntries,
    applyHosts,
    revertHosts,
  } = viewModel
  const isBusy = isLoading || isSaving || isApplying || isReverting

  return (
    <div className={s.panel}>
      <PanelHeader
        id="hosts-title"
        title={t.title}
        actions={
          <div className={s.headerActions}>
            <SimpleTooltip label={t.addEntry}>
              <button
                type="button"
                className={`ghost ${ph.iconBtn}`}
                aria-label={t.addEntry}
                onClick={addEntry}
                disabled={isBusy}
              >
                <Plus size={16} aria-hidden />
              </button>
            </SimpleTooltip>
            <SimpleTooltip label={t.save}>
              <button
                type="button"
                className={`ghost ${ph.iconBtn}`}
                aria-label={t.save}
                onClick={() => void saveEntries()}
                disabled={!isDirty || isBusy}
              >
                <Save size={16} aria-hidden />
              </button>
            </SimpleTooltip>
            <SimpleTooltip label={t.apply}>
              <button
                type="button"
                className={`ghost ${ph.iconBtn}`}
                aria-label={t.apply}
                onClick={() => void applyHosts()}
                disabled={isBusy}
              >
                <FilePenLine size={16} aria-hidden />
              </button>
            </SimpleTooltip>
            <SimpleTooltip label={t.revert}>
              <button
                type="button"
                className={`ghost ${ph.iconBtn}`}
                aria-label={t.revert}
                onClick={() => void revertHosts()}
                disabled={isBusy || !state?.managedBlockPresent}
              >
                <RotateCcw size={16} aria-hidden />
              </button>
            </SimpleTooltip>
          </div>
        }
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className={s.body}>
          <section className={s.summary}>
            <p className={s.description}>{t.description}</p>
            {state && (
              <div className={s.metaGrid}>
                <span>{t.systemPath(state.systemPath)}</span>
                <span>{t.platform(state.platform)}</span>
                <span className={state.applied ? s.statusApplied : s.statusPending}>
                  {state.applied ? t.statusApplied : t.statusPending}
                </span>
              </div>
            )}
            <p className={`small muted ${s.hint}`}>{t.applyHint}</p>
          </section>

          <section className={s.editor} aria-labelledby="hosts-title">
            <div className={s.tableHead}>
              <span>{t.enabled}</span>
              <span>{t.address}</span>
              <span>{t.hostname}</span>
              <span>{t.comment}</span>
              <span>{t.actions}</span>
            </div>

            {entries.length === 0 ? (
              <div className={s.empty}>
                <p>{isLoading ? t.loading : t.empty}</p>
                <button type="button" className="primary" onClick={addEntry} disabled={isBusy}>
                  {t.addEntry}
                </button>
              </div>
            ) : (
              <div className={s.rows}>
                {entries.map((entry, index) => (
                  <div className={s.row} key={index}>
                    <label className={s.switchLabel}>
                      <input
                        type="checkbox"
                        checked={entry.enabled}
                        onChange={(event) =>
                          updateEntry(index, 'enabled', event.currentTarget.checked)
                        }
                        disabled={isBusy}
                      />
                      <span>{entry.enabled ? t.enabled : t.disabled}</span>
                    </label>
                    <input
                      className={s.input}
                      value={entry.address}
                      placeholder="127.0.0.1"
                      onChange={(event) =>
                        updateEntry(index, 'address', event.currentTarget.value)
                      }
                      disabled={isBusy}
                    />
                    <input
                      className={s.input}
                      value={entry.hostname}
                      placeholder="api.test.local"
                      onChange={(event) =>
                        updateEntry(index, 'hostname', event.currentTarget.value)
                      }
                      disabled={isBusy}
                    />
                    <input
                      className={s.input}
                      value={entry.comment}
                      placeholder="optional"
                      onChange={(event) =>
                        updateEntry(index, 'comment', event.currentTarget.value)
                      }
                      disabled={isBusy}
                    />
                    <button
                      type="button"
                      className={`ghost danger ${s.removeButton}`}
                      aria-label={t.remove}
                      onClick={() => removeEntry(index)}
                      disabled={isBusy}
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
