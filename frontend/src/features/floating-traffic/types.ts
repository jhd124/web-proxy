import type { TrafficEntry, TrafficEntrySummary } from '../../types'

export type FloatingTrafficViewModel = {
  urlFilter: string
  setUrlFilter: (value: string) => void
  urlFilterTags: string[]
  activeFilterKeywords: readonly string[]
  commitUrlFilterInputAsTag: () => void
  removeUrlFilterTag: (keyword: string) => void
  popUrlFilterTag: () => void
  clearTraffic: () => Promise<void>
  filteredEntries: TrafficEntrySummary[]
  selectedId: string | null
  setSelectedId: (id: string) => void
  selected: TrafficEntry | null
  openMainWindowForEntry: (id: string) => Promise<void>
}
