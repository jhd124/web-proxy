import type { Dispatch, SetStateAction } from 'react'
import type { BreakpointRule } from '../../types'

export type BreakpointForm = {
  name: string
  matchOrigin: string
  matchPathRegex: string
}

export type SetBreakpointForm = Dispatch<SetStateAction<BreakpointForm>>

export type BreakpointsPanelUIProps = {
  closeBreakpointsPanel: () => void
  breakpointForm: BreakpointForm
  setBreakpointForm: SetBreakpointForm
  breakpointEntries: BreakpointRule[]
  addBreakpoint: () => void
  removeBreakpoint: (id: string) => Promise<void>
  setBreakpointEnabled: (rule: BreakpointRule, enabled: boolean) => void
  breakpointToggleSaving: Record<string, boolean>
}
