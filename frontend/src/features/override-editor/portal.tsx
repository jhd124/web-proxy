import { OverrideEditorUI } from './ui/OverrideEditorUI'
import type { OverrideEditorUIProps } from './types'

export function OverrideEditorPortal(p: OverrideEditorUIProps) {
  return <OverrideEditorUI {...p} />
}
