import type {
  CatalogSuggestion,
  RequestComposerHistoryDetail,
  RequestComposerHistoryItem,
  RequestComposerResponse,
} from '../../types'

export interface RequestComposerFormState {
  url: string
  method: string
  searchParamsText: string
  headersText: string
  body: string
}

export interface RequestComposerViewModel {
  form: RequestComposerFormState
  setFormField: (field: keyof RequestComposerFormState, value: string) => void
  hostSuggestions: CatalogSuggestion[]
  pathSuggestions: CatalogSuggestion[]
  methodSuggestions: CatalogSuggestion[]
  response: RequestComposerResponse | null
  isSending: boolean
  isRequestTargetReady: boolean
  sendRequest: () => Promise<void>
  history: RequestComposerHistoryItem[]
  selectedHistory: RequestComposerHistoryDetail | null
  selectedHistoryId: string | null
  canReuseRequest: boolean
  historyQuery: string
  setHistoryQuery: (value: string) => void
  selectHistory: (id: string) => Promise<void>
  reuseSelectedHistory: () => void
  deleteSelectedHistory: () => Promise<void>
  clearHistory: () => Promise<void>
  loadMoreHistory: () => Promise<void>
  hasMoreHistory: boolean
  historyLoading: boolean
}
