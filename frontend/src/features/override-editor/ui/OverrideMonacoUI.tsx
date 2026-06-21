import { useCallback, useEffect, useRef } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { OverrideFormState } from '../../../types'
import { useTextContextActions } from '../../text-actions/hooks/useTextContextActions'
import { textActionTexts } from '../../text-actions/texts'
import type { SetOverrideForm } from '../types'

type Props = {
  overrideEditingId: string | null
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
  editorLanguage: string
}

export function OverrideMonacoUI({
  overrideEditingId,
  overrideForm,
  setOverrideForm,
  editorLanguage,
}: Props) {
  const textActions = useTextContextActions()
  const textActionsRef = useRef(textActions)

  useEffect(() => {
    textActionsRef.current = textActions
  }, [textActions])

  const handleMount = useCallback<OnMount>((editor) => {
    const getEditorText = () => {
      const model = editor.getModel()
      if (!model) return ''

      const selection = editor.getSelection()
      if (selection && !selection.isEmpty()) {
        const selectedText = model.getValueInRange(selection).trim()
        if (selectedText) return selectedText
      }

      return model.getValue()
    }

    editor.addAction({
      id: 'proxy-text-action-page-search',
      label: textActionTexts.menu.search,
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1,
      run: () => {
        textActionsRef.current.openPageSearch(getEditorText())
      },
    })
    editor.addAction({
      id: 'proxy-text-action-global-search',
      label: textActionTexts.menu.globalSearch,
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 2,
      run: () => {
        textActionsRef.current.openGlobalSearch(getEditorText())
      },
    })
    editor.addAction({
      id: 'proxy-text-action-decode-format',
      label: textActionTexts.menu.decodeFormat,
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 3,
      run: () => {
        textActionsRef.current.openDecodeFormat(getEditorText())
      },
    })
    editor.addAction({
      id: 'proxy-text-action-browser-search',
      label: textActionTexts.menu.browserSearch,
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 4,
      run: () => {
        textActionsRef.current.openBrowserSearch(getEditorText())
      },
    })
  }, [])

  return (
    <Editor
      key={`${String(overrideEditingId ?? 'new')}:${editorLanguage}`}
      height="100%"
      theme="vs-dark"
      language={editorLanguage}
      value={overrideForm.body || ''}
      onChange={(v) => setOverrideForm((f) => ({ ...f, body: v ?? '' }))}
      onMount={handleMount}
      options={{
        minimap: { enabled: false },
        fontSize: 12,
        wordWrap: 'on',
        automaticLayout: true,
        scrollBeyondLastLine: false,
      }}
    />
  )
}
