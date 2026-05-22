import Editor from '@monaco-editor/react'
import type { OverrideFormState } from '../../../types'
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
  return (
    <Editor
      key={`${String(overrideEditingId ?? 'new')}:${editorLanguage}`}
      height="100%"
      theme="vs-dark"
      language={editorLanguage}
      value={overrideForm.body || ''}
      onChange={(v) => setOverrideForm((f) => ({ ...f, body: v ?? '' }))}
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
