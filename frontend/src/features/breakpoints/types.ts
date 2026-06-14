import type { Dispatch, SetStateAction } from 'react'
import type { BreakpointRule } from '../../types'

export type BreakpointForm = {
  name: string
  matchMethod: string
  matchOrigin: string
  matchPathRegex: string
}

export type SetBreakpointForm = Dispatch<SetStateAction<BreakpointForm>>

export type BreakpointsPanelUIProps = {
  closeBreakpointsPanel: () => void
  variant?: 'dialog' | 'sidebar' | 'embedded'
  breakpointForm: BreakpointForm
  setBreakpointForm: SetBreakpointForm
  breakpointEntries: BreakpointRule[]
  selectedBreakpointId: string | null
  setSelectedBreakpointId: (id: string | null) => void
  startNewBreakpoint: () => void
  addBreakpoint: (originFallback?: string) => void
  selectedRequestOrigin: string
  removeBreakpoint: (id: string) => Promise<void>
  setBreakpointEnabled: (rule: BreakpointRule, enabled: boolean) => void
  breakpointToggleSaving: Record<string, boolean>
  highlightedBreakpointId?: string | null
}
