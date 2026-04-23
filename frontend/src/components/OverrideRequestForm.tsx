import type { Dispatch, SetStateAction } from 'react'
import type { OverrideFormState, TrafficEntry } from '../types'

type SetOverrideForm = Dispatch<SetStateAction<OverrideFormState>>

type Props = {
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
  selectedCanControlStream: boolean
  selected: TrafficEntry | null
  streamActionSaving: Record<string, boolean>
  playControlledStream: (id: string) => void
  pauseControlledStream: (id: string) => void
}

export function OverrideRequestForm({
  overrideForm,
  setOverrideForm,
  selectedCanControlStream,
  selected,
  streamActionSaving,
  playControlledStream,
  pauseControlledStream,
}: Props) {
  return (
    <div className="override-info-form">
      <label>
        Name
        <input
          value={overrideForm.name}
          onChange={(e) =>
            setOverrideForm((f) => ({ ...f, name: e.target.value }))
          }
        />
      </label>
      <label className="stream-toggle">
        <span className="stream-toggle-row">
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
          <span>Enable this override rule</span>
        </span>
      </label>
      <label>
        Match method
        <input
          value={overrideForm.matchMethod}
          onChange={(e) =>
            setOverrideForm((f) => ({
              ...f,
              matchMethod: e.target.value,
            }))
          }
          placeholder="GET"
        />
      </label>
      <label>
        Host contains
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
      <label className="wide">
        Path regex
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
        Status
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
      <label className="wide">
        Response headers (one <code>Name: value</code> per line)
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
      <label className="stream-toggle">
        <span className="stream-toggle-row">
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
            Stream body (double newline = chunk;{' '}
            <code>text/event-stream</code> in headers)
          </span>
        </span>
      </label>
      {selectedCanControlStream && selected && (
        <div className="stream-preview-section">
          <label>
            Interval between chunks (ms)
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
          <div className="stream-preview-controls">
            <span className="small muted">Stream controller</span>
            <div className="stream-preview-btns">
              <button
                type="button"
                className="ghost"
                onClick={() => void playControlledStream(selected.id)}
                disabled={
                  streamActionSaving[selected.id] === true ||
                  selected.streamPlaying === true
                }
              >
                Play
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
                Stop
              </button>
            </div>
          </div>
          <pre className="pre stream-preview-out mono tiny">
            {streamActionSaving[selected.id] === true
              ? 'Updating stream controller...'
              : selected.pending
                ? 'Request is paused. Press Play to start streaming the override response.'
                : selected.streamPlaying
                  ? 'Streaming. Press Stop to pause after the current chunk.'
                  : 'Paused. Press Play to continue.'}
          </pre>
        </div>
      )}
    </div>
  )
}
