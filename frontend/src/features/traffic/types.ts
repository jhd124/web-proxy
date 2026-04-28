import type { TrafficEntry } from '../../types'

export type TrafficPanelUIProps = {
  urlFilter: string
  setUrlFilter: (v: string) => void
  testError: string | null
  clearTraffic: () => void
  filteredEntries: TrafficEntry[]
  selectedId: string | null
  setSelectedId: (id: string) => void
  selected: TrafficEntry | null
  selectedIsEventStream: boolean
  openOverrideDrawer: () => void
  addBreakpointFromSelected: () => void
  resumeRequest: (id: string) => void
  resumeSaving: Record<string, boolean>
}
