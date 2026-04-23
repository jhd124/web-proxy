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
}

export function OverrideRequestFormUI({
  overrideForm,
  setOverrideForm,
  selectedCanControlStream,
  selected,
  streamActionSaving,
  playControlledStream,
  pauseControlledStream,
}: Props) {
  return (
    <div className={s.form}>
      <label>
        {t.name}
        <input
          value={overrideForm.name}
          onChange={(e) =>
            setOverrideForm((f) => ({ ...f, name: e.target.value }))
          }
        />
      </label>
      <label className={s.streamToggle}>
        <span className={s.streamToggleRow}>
          <input
            type="checkbox"
            checked={overrideForm.enabled}
            onChange={(e) =>
              setOverrideForm((f) => ({
                ...f,
                enabled: e.target.checked,
              }))
            }
          />
          <span>{t.enableRule}</span>
        </span>
      </label>
      <label>
        {t.matchMethod}
        <input
          value={overrideForm.matchMethod}
          onChange={(e) =>
            setOverrideForm((f) => ({
              ...f,
              matchMethod: e.target.value,
            }))
          }
          placeholder={t.matchMethodPlaceholder}
        />
      </label>
      <label>
        {t.host}
        <input
          value={overrideForm.matchHost}
          onChange={(e) =>
            setOverrideForm((f) => ({
              ...f,
              matchHost: e.target.value,
            }))
          }
        />
      </label>
      <label className={s.labelWide}>
        {t.pathRegex}
        <input
          className="mono"
          value={overrideForm.matchPathRegex}
          onChange={(e) =>
            setOverrideForm((f) => ({
              ...f,
              matchPathRegex: e.target.value,
            }))
          }
        />
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
          <pre
            className={`pre ${s.streamPreviewOut} mono tiny`}
          >
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
