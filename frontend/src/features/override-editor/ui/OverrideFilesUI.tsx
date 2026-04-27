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
}

export function OverrideFilesUI({
  overrideFileInputRef,
  overrideForm,
  setOverrideForm,
  overrideEntries,
  startNewOverride,
  openOverrideEditorForKey,
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
            <li key={override.id} className={s.cardWrap}>
              <button
                type="button"
                className={`${s.card} ${s.cardButton} ${
                  !override.enabled ? s.cardDisabled : ''
                }`}
                onClick={() => openOverrideEditorForKey(override)}
                aria-label={tf.openRule(override.name)}
              >
                <div className={s.head}>
                  <strong>
                    {override.name}{' '}
                    {!override.enabled && (
                      <span className="pill subtle">{tf.disabled}</span>
                    )}
                  </strong>
                </div>
                <p className={`small mono ${s.overrideSig}`}>
                  <span className={s.tagSig}>{override.matchMethod ?? '∗'}</span>{' '}
                  {override.matchHost ?? '∗'}
                  <span className={s.pathSig}>{override.matchPath ?? '∗'}</span>
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
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
