import Editor from '@monaco-editor/react'
import type { OverrideFormState } from '../../../types'
import { overrideEditorTexts } from '../texts'
import type { SetOverrideForm } from '../types'
import s from './OverrideMonacoUI.module.css'

type Props = {
  overrideEditingId: string | null
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
}

const t = overrideEditorTexts.monaco

export function OverrideMonacoUI({
  overrideEditingId,
  overrideForm,
  setOverrideForm,
}: Props) {
  return (
    <div className={s.mainCol}>
      <div className={s.monacoWrap}>
        <p className={`${s.mainHint} small muted`}>
          {overrideForm.streamEnabled ? t.stream : t.body}
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
