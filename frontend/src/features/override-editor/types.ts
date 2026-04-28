import type { Dispatch, RefObject, SetStateAction } from 'react'
import type { OverrideFormState, OverrideRule, TrafficEntry } from '../../types'

export type SetOverrideForm = Dispatch<SetStateAction<OverrideFormState>>

export type AddBreakpointFromOverride = (
  source: {
    name: string
    matchHost?: string | null
    matchPath?: string | null
  },
  originHint?: string,
) => void

export type OverrideEditorUIProps = {
  closeOverrideDrawer: () => void
  saveOverride: () => void
  overrideError: string | null
  requestPanelFocusKey: number
  overrideFileInputRef: RefObject<HTMLInputElement | null>
  overrideForm: OverrideFormState
  setOverrideForm: SetOverrideForm
  overrideEntries: OverrideRule[]
  startNewOverride: () => void
  openOverrideEditorForKey: (override: OverrideRule) => void
  overrideToggleSaving: Record<string, boolean>
  setOverrideEnabled: (override: OverrideRule, enabled: boolean) => void
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
  /** SHA-256 hex from current match fields (may differ from saved `id` until save). */
  computedOverrideId: string | null
}
