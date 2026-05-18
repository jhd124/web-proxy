import { SavedRequestsPanelUI } from './ui/SavedRequestsPanelUI'
import type { SavedRequestsPanelUIProps } from './types'

export function SavedRequestsPanelPortal(p: SavedRequestsPanelUIProps) {
  return <SavedRequestsPanelUI {...p} />
}
