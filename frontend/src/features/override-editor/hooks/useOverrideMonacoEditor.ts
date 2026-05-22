import { useCallback, useMemo, useState } from 'react'
import type { OverrideFormState } from '../../../types'
import { beautifyOverrideBody, uglifyOverrideBody } from '../overrideBodyFormat'
import {
  contentTypeToFormatKind,
  contentTypeToMonacoLanguage,
  getResponseContentType,
} from '../overrideResponseLanguage'
import { overrideEditorTexts } from '../texts'
import type { SetOverrideForm } from '../types'

const t = overrideEditorTexts.monaco

type Params = {
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
}

export function useOverrideMonacoEditor({
  overrideForm,
  setOverrideForm,
}: Params) {
  const [isFormatting, setIsFormatting] = useState(false)

  const responseContentType = useMemo(
    () => getResponseContentType(overrideForm.headersText),
    [overrideForm.headersText],
  )

  const editorLanguage = useMemo(
    () => contentTypeToMonacoLanguage(responseContentType),
    [responseContentType],
  )

  const formatKind = useMemo(
    () => contentTypeToFormatKind(responseContentType),
    [responseContentType],
  )

  const canFormatBody =
    formatKind !== null && !overrideForm.streamEnabled

  const runFormat = useCallback(
    async (mode: 'beautify' | 'uglify') => {
      if (!formatKind) return
      setIsFormatting(true)
      try {
        const next =
          mode === 'beautify'
            ? await beautifyOverrideBody(overrideForm.body, formatKind)
            : await uglifyOverrideBody(overrideForm.body, formatKind)
        setOverrideForm((f) => ({ ...f, body: next }))
      } catch (e) {
        window.alert(`${t.formatFailed}: ${String(e)}`)
      } finally {
        setIsFormatting(false)
      }
    },
    [formatKind, overrideForm.body, setOverrideForm],
  )

  const handleBeautify = useCallback(() => {
    void runFormat('beautify')
  }, [runFormat])

  const handleUglify = useCallback(() => {
    void runFormat('uglify')
  }, [runFormat])

  return {
    responseContentType,
    editorLanguage,
    canFormatBody,
    isFormatting,
    handleBeautify,
    handleUglify,
    languageLabel:
      editorLanguage !== 'plaintext'
        ? t.languageLabel(editorLanguage)
        : null,
  }
}
