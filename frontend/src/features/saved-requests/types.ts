import type { SavedRequest, TrafficEntry } from '../../types'

export type SavedRequestsPanelUIProps = {
  savedRequests: SavedRequest[]
  selectedSavedRequestId: string | null
  setSelectedSavedRequestId: (id: string) => void
  closeSavedRequestsPanel: () => void
  variant?: 'dialog' | 'sidebar' | 'embedded'
  composeSavedRequest: (id: string) => void
  removeSavedRequest: (id: string) => Promise<void>
  clearSavedRequests: () => Promise<void>
}

export type SavedRequestState = {
  savedRequests: SavedRequest[]
  selectedSavedRequestId: string | null
  selectedSavedRequest: SavedRequest | null
  setSelectedSavedRequestId: (id: string) => void
  saveRequest: (entry: TrafficEntry) => Promise<void>
  isRequestSaved: (id: string) => boolean
  removeSavedRequest: (id: string) => Promise<void>
  clearSavedRequests: () => Promise<void>
}
