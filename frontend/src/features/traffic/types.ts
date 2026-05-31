import type { TrafficEntry } from '../../types'

export type TrafficPanelUIProps = {
  testError: string | null
  filteredEntries: TrafficEntry[]
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  selected: TrafficEntry | null
  selectedIsEventStream: boolean
  selectedIsSaved: boolean
  openOverrideDrawer: () => void
  saveSelectedRequest: () => Promise<void>
  addBreakpointFromSelected: () => void
  openMatchedOverride: () => void
  openMatchedBreakpoint: () => void
  resumeRequest: (id: string) => void
  resumeSaving: Record<string, boolean>
}
