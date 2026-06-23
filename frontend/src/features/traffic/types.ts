import type { TrafficEntry, TrafficEntrySummary } from '../../types'

export type TrafficPanelUIProps = {
  testError: string | null
  filteredEntries: TrafficEntrySummary[]
  matchedTrafficEntryIds: ReadonlySet<string>
  savedTrafficEntryIds: ReadonlySet<string>
  matchedOverrideByEntryId: ReadonlyMap<string, string>
  matchedBreakpointByEntryId: ReadonlyMap<string, string>
  selectedId: string | null
  setSelectedId: (id: string | null) => void
  selected: TrafficEntry | null
  selectedIsEventStream: boolean
  searchKeywords: readonly string[]
  onEntryCopyCurl: (id: string) => void
  onEntrySaveRequest: (id: string) => Promise<void>
  onEntryOverride: (id: string) => void
  onEntryAddBreakpoint: (id: string) => Promise<void>
  onEntryOpenSavedRequest: (id: string) => void
  onEntryOpenMatchedOverride: (id: string) => void
  onEntryOpenMatchedBreakpoint: (id: string) => void
}
