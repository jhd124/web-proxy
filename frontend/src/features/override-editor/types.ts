import type { RefObject } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { OverrideFormState, OverrideRule, TrafficEntry } from '../../types'

export type SetOverrideForm = Dispatch<SetStateAction<OverrideFormState>>

export type AddBreakpointFromOverride = (
  source: {
    name: string
    matchHost?: string | null
    matchPathRegex?: string | null
  },
  originHint?: string,
) => void

export type OverrideEditorUIProps = {
  closeOverrideDrawer: () => void
  saveOverride: () => void
  overrideError: string | null
  overrideLeftTool: 'files' | 'info'
  setOverrideLeftTool: (t: 'files' | 'info') => void
  overrideFileInputRef: RefObject<HTMLInputElement | null>
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
  overrideEntries: OverrideRule[]
  startNewOverride: () => void
  openOverrideEditorForKey: (override: OverrideRule) => void
  onAddBreakpointForListOverride: (override: OverrideRule) => void
  overrideBodyDrafts: Record<string, string>
  setOverrideBodyDrafts: Dispatch<SetStateAction<Record<string, string>>>
  overrideBodySaving: Record<string, boolean>
  overrideToggleSaving: Record<string, boolean>
  setOverrideEnabled: (override: OverrideRule, enabled: boolean) => void
  saveOverrideBody: (override: OverrideRule) => void
  deleteOverrideRule: (id: string) => Promise<void>
  selected: TrafficEntry | null
  selectedMatchingOverride: OverrideRule | null
  overrideEditingId: string | null
  selectedCanControlStream: boolean
  resumeRequest: (id: string) => void
  resumeSaving: Record<string, boolean>
  addBreakpointFromOverride: AddBreakpointFromOverride
  streamActionSaving: Record<string, boolean>
  playControlledStream: (id: string) => void
  pauseControlledStream: (id: string) => void
}
