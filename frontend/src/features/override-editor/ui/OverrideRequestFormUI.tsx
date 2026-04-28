import type { OverrideFormState, TrafficEntry } from '../../../types'
import { overrideEditorTexts } from '../texts'
import type { SetOverrideForm } from '../types'
import s from './OverrideRequestFormUI.module.css'

const t = overrideEditorTexts.request

type Props = {
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
  selectedCanControlStream: boolean
  selected: TrafficEntry | null
  streamActionSaving: Record<string, boolean>
  playControlledStream: (id: string) => void
  pauseControlledStream: (id: string) => void
  computedOverrideId: string | null
}

function KvList({
  ariaLabel,
  value,
  onChange,
  onAdd,
  addLabel,
  help,
}: {
  ariaLabel: string
  value: [string, string][]
  onChange: (rows: [string, string][]) => void
  onAdd: () => void
  addLabel: string
  help: string
}) {
  return (
    <div className={s.kvList} role="group" aria-label={ariaLabel}>
      <p className={`small muted ${s.kvHelp}`}>{help}</p>
      {value.map((row, i) => (
        <div key={i} className={s.kvRow}>
          <input
            className="mono"
            aria-label={`${ariaLabel} name ${i + 1}`}
            placeholder="name"
            value={row[0]}
            onChange={(e) => {
              const n = value.slice() as [string, string][]
              n[i] = [e.target.value, n[i]![1]]
              onChange(n)
            }}
          />
          <input
            className="mono"
            aria-label={`${ariaLabel} value ${i + 1}`}
            placeholder="value"
            value={row[1]}
            onChange={(e) => {
              const n = value.slice() as [string, string][]
              n[i] = [n[i]![0], e.target.value]
              onChange(n)
            }}
          />
          <button
            type="button"
            className={`ghost ${s.kvRemove}`}
            aria-label="Remove row"
            onClick={() => onChange(value.filter((_, j) => j !== i) as [string, string][])}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="ghost" onClick={onAdd}>
        {addLabel}
      </button>
    </div>
  )
}

export function OverrideRequestFormUI({
  overrideForm,
  setOverrideForm,
  selectedCanControlStream,
  selected,
  streamActionSaving,
  playControlledStream,
  pauseControlledStream,
  computedOverrideId,
}: Props) {
  return (
    <div className={s.form}>
      <div className={s.matchIdBlock}>
        <div className="small muted">{t.matchIdLabel}</div>
        <code className={`${s.idHex} mono tiny`}>
          {computedOverrideId === null ? '…' : computedOverrideId}
        </code>
        <p className={`tiny muted ${s.matchIdDrift}`}>{t.matchIdDrift}</p>
      </div>
      <label className={s.streamToggle}>
        <span className={s.streamToggleRow}>
          <input
            type="checkbox"
            checked={overrideForm.enabled}
            onChange={(e) =>
              setOverrideForm((f) => ({ ...f, enabled: e.target.checked }))
            }
          />
          <span>{t.enableRule}</span>
        </span>
      </label>
      <label>
        {t.protocol}
        <input
          className="mono"
          value={overrideForm.matchProtocol}
          placeholder="https"
          onChange={(e) =>
            setOverrideForm((f) => ({ ...f, matchProtocol: e.target.value }))
          }
        />
        <span className="tiny muted">{t.protocolHint}</span>
      </label>
      <label>
        {t.host}
        <input
          required
          autoComplete="off"
          value={overrideForm.matchHost}
          onChange={(e) =>
            setOverrideForm((f) => ({ ...f, matchHost: e.target.value }))
          }
        />
        <span className="tiny muted">{t.hostHint}</span>
      </label>
      <label className={s.labelWide}>
        {t.path}
        <input
          className="mono"
          value={overrideForm.matchPath}
          onChange={(e) =>
            setOverrideForm((f) => ({ ...f, matchPath: e.target.value }))
          }
        />
        <span className="tiny muted">{t.pathHint}</span>
      </label>
      <div className={s.fieldGroup}>
        <div className={s.subLabel}>{t.matchHeaders}</div>
        <KvList
          ariaLabel={t.matchHeaders}
          value={overrideForm.matchRequestHeaders}
          onChange={(rows) =>
            setOverrideForm((f) => ({ ...f, matchRequestHeaders: rows }))
          }
          onAdd={() =>
            setOverrideForm((f) => ({
              ...f,
              matchRequestHeaders: [...f.matchRequestHeaders, ['', '']],
            }))
          }
          addLabel={t.addHeaderRow}
          help={t.matchHeadersHelp}
        />
      </div>
      <div className={s.fieldGroup}>
        <div className={s.subLabel}>{t.matchQuery}</div>
        <KvList
          ariaLabel={t.matchQuery}
          value={overrideForm.matchQuery}
          onChange={(rows) =>
            setOverrideForm((f) => ({ ...f, matchQuery: rows }))
          }
          onAdd={() =>
            setOverrideForm((f) => ({
              ...f,
              matchQuery: [...f.matchQuery, ['', '']],
            }))
          }
          addLabel={t.addQueryRow}
          help={t.matchQueryHelp}
        />
      </div>
      <label className={s.labelWide}>
        {t.matchBody}
        <textarea
          rows={3}
          className="mono"
          spellCheck={false}
          value={overrideForm.matchRequestBody}
          onChange={(e) =>
            setOverrideForm((f) => ({ ...f, matchRequestBody: e.target.value }))
          }
        />
        <span className="tiny muted">{t.matchBodyHelp}</span>
      </label>
      <label>
        {t.status}
        <input
          type="number"
          value={overrideForm.status}
          onChange={(e) =>
            setOverrideForm((f) => ({
              ...f,
              status: Number(e.target.value) || 200,
            }))
          }
        />
      </label>
      <label className={s.labelWide}>
        {t.responseHeaders} <code>{t.codeName}</code> {t.perLine}
        <textarea
          rows={4}
          className="mono"
          spellCheck={false}
          value={overrideForm.headersText}
          onChange={(e) =>
            setOverrideForm((f) => ({
              ...f,
              headersText: e.target.value,
            }))
          }
        />
      </label>
      <label className={s.streamToggle}>
        <span className={s.streamToggleRow}>
          <input
            type="checkbox"
            checked={overrideForm.streamEnabled}
            onChange={(e) =>
              setOverrideForm((f) => ({
                ...f,
                streamEnabled: e.target.checked,
              }))
            }
          />
          <span>
            {t.streamHint} <code>text/event-stream</code> {t.eventStream}
          </span>
        </span>
      </label>
      {selectedCanControlStream && selected && (
        <div className={s.streamPreviewSection}>
          <label>
            {t.chunkInterval}
            <input
              type="number"
              min={0}
              step={50}
              value={overrideForm.streamIntervalMs}
              onChange={(e) =>
                setOverrideForm((f) => ({
                  ...f,
                  streamIntervalMs: Number(e.target.value) || 0,
                }))
              }
            />
          </label>
          <div className={s.streamPreviewControls}>
            <span className="small muted">{t.streamController}</span>
            <div className={s.streamPreviewBtns}>
              <button
                type="button"
                className="ghost"
                onClick={() => void playControlledStream(selected.id)}
                disabled={
                  streamActionSaving[selected.id] === true ||
                  selected.streamPlaying === true
                }
              >
                {t.play}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void pauseControlledStream(selected.id)}
                disabled={
                  streamActionSaving[selected.id] === true ||
                  selected.streamPlaying !== true
                }
              >
                {t.stop}
              </button>
            </div>
          </div>
          <pre className={`pre ${s.streamPreviewOut} mono tiny`}>
            {streamActionSaving[selected.id] === true
              ? t.statusUpdating
              : selected.pending
                ? t.statusPausedDetail
                : selected.streamPlaying
                  ? t.statusStreaming
                  : t.statusPaused}
          </pre>
        </div>
      )}
    </div>
  )
}
