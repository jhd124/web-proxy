import Editor from '@monaco-editor/react'
import type { Dispatch, SetStateAction } from 'react'
import type { OverrideFormState } from '../types'

type SetOverrideForm = Dispatch<SetStateAction<OverrideFormState>>

type Props = {
  overrideEditingId: string | null
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
}

export function OverrideMonacoPane({
  overrideEditingId,
  overrideForm,
  setOverrideForm,
}: Props) {
  return (
    <div className="override-main-col">
      <div className="override-monaco-wrap">
        <p className="override-main-hint small muted">
          {overrideForm.streamEnabled
            ? 'Stream: separate chunks with a blank line in the source.'
            : 'Response body (override)'}
        </p>
        <Editor
          key={String(overrideEditingId ?? 'new')}
          height="100%"
          theme="vs-dark"
          defaultLanguage="plaintext"
          value={overrideForm.body}
          onChange={(v) => setOverrideForm((f) => ({ ...f, body: v ?? '' }))}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
          }}
        />
      </div>
    </div>
  )
}
