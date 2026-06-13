import type { ReactElement } from 'react'
import type { OverrideFormState } from '../../../types'
import { useOverrideMonacoEditor } from '../hooks/useOverrideMonacoEditor'
import { overrideBodyToImageSrc } from '../overrideBodyImageSrc'
import { isImageContentType } from '../overrideResponseLanguage'
import { overrideEditorTexts } from '../texts'
import type { SetOverrideForm } from '../types'
import { OverrideBodyImageUI } from './OverrideBodyImageUI'
import { OverrideMonacoUI } from './OverrideMonacoUI'
import s from './OverrideBodyEditorUI.module.css'

type Props = {
  overrideEditingId: string | null
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
}

const t = overrideEditorTexts.monaco

export function OverrideBodyEditorUI({
  overrideEditingId,
  overrideForm,
  setOverrideForm,
}: Props): ReactElement {
  const {
    responseContentType,
    editorLanguage,
    canFormatBody,
    isFormatting,
    handleBeautify,
    handleUglify,
    languageLabel,
  } = useOverrideMonacoEditor({ overrideForm, setOverrideForm })

  const isImageResponse =
    isImageContentType(responseContentType) && !overrideForm.streamEnabled
  const imageSrc = isImageResponse
    ? overrideBodyToImageSrc(overrideForm.body, responseContentType)
    : null
  const imageMimeLabel = responseContentType.split(';')[0]?.trim() || 'image/*'

  const hintText = overrideForm.streamEnabled
    ? t.stream
    : imageSrc
      ? t.imageBody
      : isImageResponse && !imageSrc
        ? t.imagePreviewUnavailable
        : t.body

  const matchUrl = overrideForm.matchHost
    ? `${overrideForm.matchProtocol || 'https'}://${overrideForm.matchHost}${overrideForm.matchPath || ''}`
    : ''

  return (
    <div className={s.mainCol}>
      <div className={s.bodyWrap}>
        <div className={s.mainHintRow}>
          <p className={`${s.mainHint} small muted`} title={matchUrl || hintText}>
            {matchUrl || hintText}
          </p>
          <div className={s.mainHintActions}>
            {!imageSrc && languageLabel ? (
              <span className={`${s.langBadge} small muted`}>{languageLabel}</span>
            ) : null}
            {!imageSrc && canFormatBody ? (
              <>
                <button
                  type="button"
                  className="ghost"
                  disabled={isFormatting}
                  onClick={handleBeautify}
                >
                  {t.beautify}
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={isFormatting}
                  onClick={handleUglify}
                >
                  {t.uglify}
                </button>
              </>
            ) : null}
          </div>
        </div>
        {imageSrc ? (
          <OverrideBodyImageUI imageSrc={imageSrc} mimeLabel={imageMimeLabel} />
        ) : (
          <OverrideMonacoUI
            overrideEditingId={overrideEditingId}
            overrideForm={overrideForm}
            setOverrideForm={setOverrideForm}
            editorLanguage={editorLanguage}
          />
        )}
      </div>
    </div>
  )
}
