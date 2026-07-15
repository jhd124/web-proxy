import type { OverrideFormState, TrafficEntry } from '../../../types'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { overrideEditorTexts } from '../texts'
import type { SetOverrideForm } from '../types'
import { LabelHint } from './LabelHint'
import s from './OverrideRequestFormUI.module.css'

const t = overrideEditorTexts.request
const METHOD_ANY_VALUE = '__ANY__'
const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const PROTOCOL_ANY_VALUE = '__ANY_PROTOCOL__'
const PROTOCOL_OPTIONS = ['http', 'https']

type Props = {
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
  selectedCanControlStream: boolean
  selected: TrafficEntry | null
  streamActionSaving: Record<string, boolean>
  playControlledStream: (id: string) => void
  pauseControlledStream: (id: string) => void
}

function KvList({
  ariaLabel,
  value,
  onChange,
  onAdd,
  addLabel,
}: {
  ariaLabel: string
  value: [string, string][]
  onChange: (rows: [string, string][]) => void
  onAdd: () => void
  addLabel: string
}) {
  return (
    <div className={s.kvList} role="group" aria-label={ariaLabel}>
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
}: Props) {
  return (
    <div className={s.form}>
      <label>
        <span className={s.labelRow}>
          {t.method}
          <LabelHint hint={t.methodHint} />
        </span>
        <Select
          value={overrideForm.matchMethod || METHOD_ANY_VALUE}
          onValueChange={(value) =>
            setOverrideForm((f) => ({
              ...f,
              matchMethod: value === METHOD_ANY_VALUE ? '' : value,
            }))
          }
        >
          <SelectTrigger className="mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={METHOD_ANY_VALUE}>ANY</SelectItem>
            {METHOD_OPTIONS.map((method) => (
              <SelectItem key={method} value={method}>
                {method}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label>
        <span className={s.labelRow}>
          {t.protocol}
          <LabelHint hint={t.protocolHint} />
        </span>
        <Select
          value={overrideForm.matchProtocol || PROTOCOL_ANY_VALUE}
          onValueChange={(value) =>
            setOverrideForm((f) => ({
              ...f,
              matchProtocol: value === PROTOCOL_ANY_VALUE ? '' : value,
            }))
          }
        >
          <SelectTrigger className="mono">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PROTOCOL_ANY_VALUE}>ANY</SelectItem>
            {PROTOCOL_OPTIONS.map((protocol) => (
              <SelectItem key={protocol} value={protocol}>
                {protocol}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label>
        <span className={s.labelRow}>
          {t.host}
          <LabelHint hint={t.hostHint} />
        </span>
        <input
          required
          autoComplete="off"
          value={overrideForm.matchHost}
          onChange={(e) =>
            setOverrideForm((f) => ({ ...f, matchHost: e.target.value }))
          }
        />
      </label>
      <label className={s.labelWide}>
        <span className={s.labelRow}>
          {t.path}
          <LabelHint hint={t.pathHint} />
        </span>
        <input
          className="mono"
          value={overrideForm.matchPath}
          onChange={(e) =>
            setOverrideForm((f) => ({ ...f, matchPath: e.target.value }))
          }
        />
      </label>
      <div className={s.fieldGroup}>
        <div className={`${s.subLabel} ${s.labelRow}`}>
          {t.matchHeaders}
          <LabelHint hint={t.matchHeadersHelp} />
        </div>
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
        />
      </div>
      <div className={s.fieldGroup}>
        <div className={`${s.subLabel} ${s.labelRow}`}>
          {t.matchQuery}
          <LabelHint hint={t.matchQueryHelp} />
        </div>
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
        />
      </div>
      <label className={s.labelWide}>
        <span className={s.labelRow}>
          {t.matchBody}
          <LabelHint hint={t.matchBodyHelp} />
        </span>
        <textarea
          rows={3}
          className="mono"
          spellCheck={false}
          value={overrideForm.matchRequestBody}
          onChange={(e) =>
            setOverrideForm((f) => ({ ...f, matchRequestBody: e.target.value }))
          }
        />
      </label>
      <label className={s.streamToggle}>
        <span className={s.streamToggleRow}>
          <input
            type="checkbox"
            checked={overrideForm.mapRemoteEnabled}
            onChange={(e) =>
              setOverrideForm((f) => ({ ...f, mapRemoteEnabled: e.target.checked }))
            }
          />
          <span>{t.enableMapRemote}</span>
        </span>
      </label>
      {overrideForm.mapRemoteEnabled ? (
        <div className={s.fieldGroup}>
          <div className={`${s.subLabel} ${s.labelRow}`}>
            Map remote rule
            <LabelHint hint={t.mapRemoteRuleHint} />
          </div>
          <label>
            {t.mapRemoteProtocol}
            <input
              className="mono"
              placeholder="http"
              value={overrideForm.mapRemoteProtocol}
              onChange={(e) =>
                setOverrideForm((f) => ({ ...f, mapRemoteProtocol: e.target.value }))
              }
            />
          </label>
          <label>
            {t.mapRemoteHost}
            <input
              className="mono"
              placeholder="localhost:3000"
              value={overrideForm.mapRemoteHost}
              onChange={(e) =>
                setOverrideForm((f) => ({ ...f, mapRemoteHost: e.target.value }))
              }
            />
          </label>
          <label className={s.labelWide}>
            {t.mapRemotePath}
            <input
              className="mono"
              placeholder="*"
              value={overrideForm.mapRemotePath}
              onChange={(e) =>
                setOverrideForm((f) => ({ ...f, mapRemotePath: e.target.value }))
              }
            />
          </label>
        </div>
      ) : null}
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
        <span className={s.labelRow}>
          {t.responseHeadersLabel}
          <LabelHint
            hint={
              <>
                {t.responseHeaders} <code>{t.codeName}</code> {t.perLine}{' '}
                {t.responseHeadersWildcardHint}
              </>
            }
          />
        </span>
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
