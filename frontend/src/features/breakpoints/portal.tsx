import { BreakpointsPanelUI } from './ui/BreakpointsPanelUI'
import type { BreakpointsPanelUIProps } from './types'

export function BreakpointsPanelPortal(p: BreakpointsPanelUIProps) {
  return <BreakpointsPanelUI {...p} />
}
