import type { TrafficEntry } from '../../types'

export type FloatingTrafficViewModel = {
  urlFilter: string
  setUrlFilter: (value: string) => void
  clearTraffic: () => Promise<void>
  filteredEntries: TrafficEntry[]
  selectedId: string | null
  setSelectedId: (id: string) => void
  selected: TrafficEntry | null
  openMainWindowForEntry: (id: string) => Promise<void>
}
