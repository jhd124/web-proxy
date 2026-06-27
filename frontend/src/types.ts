export type TrafficKind = 'http' | 'connect'

export interface TrafficEntry {
  id: string
  at: string
  /** Client socket that connected to the proxy */
  peer: string
  /** Best-effort application/process name from backend */
  appName?: string | null
  method: string
  url: string
  scheme: string
  host: string
  path: string
  requestHeaders: [string, string][]
  requestBodyPreview?: string | null
  kind: TrafficKind
  mitmBypassed?: boolean
  responseStatus?: number | null
  responseHeaders?: [string, string][] | null
  responseBodyPreview?: string | null
  durationMs?: number | null
  error?: string | null
  pending: boolean
  breakpointName?: string | null
  overrideMatchId?: string | null
  breakpointMatchId?: string | null
  streamControllable: boolean
  streamPlaying?: boolean | null
}

export interface TrafficEntrySummary {
  id: string
  at: string
  peer: string
  appName?: string | null
  method: string
  url: string
  scheme: string
  host: string
  path: string
  kind: TrafficKind
  mitmBypassed?: boolean
  responseStatus?: number | null
  durationMs?: number | null
  error?: string | null
  pending: boolean
  breakpointName?: string | null
  overrideMatchId?: string | null
  breakpointMatchId?: string | null
  streamControllable: boolean
  streamPlaying?: boolean | null
  requestContentType?: string | null
  responseContentType?: string | null
  requesterAppName: string
  websocket: boolean
  resourceType?: string
  methodTag?: string
  statusClass?: string | null
  urlFilterText?: string
  searchText?: string
}

export interface SavedRequest {
  id: string
  savedAt: string
  entry: TrafficEntry
}

export interface CatalogFieldSchema {
  key: string
  valueType: string
}

export interface CatalogBodySchema {
  kind: string
  contentType?: string | null
  fields: CatalogFieldSchema[]
}

export interface RequestCatalogTemplate {
  host: string
  path: string
  method: string
  searchParamsSchema: CatalogFieldSchema[]
  bodySchema?: CatalogBodySchema | null
  headers: [string, string][]
  lastSeenAt: string
}

export interface CatalogSuggestion {
  value: string
  hitCount: number
  lastSeenAt: string
}

export interface RequestCatalogSettings {
  persistSensitiveHeaders: boolean
}

export interface ManagedHostEntry {
  address: string
  hostname: string
  enabled: boolean
  comment: string
}

export interface HostsState {
  entries: ManagedHostEntry[]
  systemPath: string
  platform: string
  managedBlockPresent: boolean
  applied: boolean
  writeRequiresElevation: boolean
}

export interface RequestComposerRequest {
  scheme: string
  host: string
  path: string
  method: string
  searchParams: [string, string][]
  headers: [string, string][]
  body?: string | null
}

export interface RequestComposerResponse {
  status?: number | null
  headers: [string, string][]
  bodyPreview?: string | null
  durationMs: number
  error?: string | null
}

export interface RequestComposerSendResponse {
  historyId: string
  response: RequestComposerResponse
}

export interface RequestComposerHistoryItem {
  id: string
  sentAt: string
  method: string
  url: string
  host: string
  path: string
  responseStatus?: number | null
  durationMs: number
  error?: string | null
}

export interface RequestComposerHistoryDetail {
  id: string
  sentAt: string
  request: RequestComposerRequest
  url: string
  response: RequestComposerResponse
}

export interface OverrideRule {
  id: string
  enabled: boolean
  matchMethod?: string | null
  matchProtocol?: string | null
  matchHost?: string | null
  /** Plain request path (no query); compared (after normalization) to the incoming path. */
  matchPath?: string | null
  matchRequestHeaders?: [string, string][]
  matchQuery?: [string, string][]
  matchRequestBody?: string | null
  status: number
  /** Response headers for the override. */
  headers: [string, string][]
  body: string
  mapRemoteProtocol?: string | null
  mapRemoteHost?: string | null
  mapRemotePath?: string | null
  streamIntervalMs?: number | null
}

export interface BreakpointRule {
  id: string
  name: string
  enabled: boolean
  matchMethod?: string | null
  matchOrigin?: string | null
  matchPathRegex?: string | null
}

/** Editable state for the override full-screen editor (form + Monaco). */
export interface OverrideFormState {
  enabled: boolean
  status: number
  body: string
  headersText: string
  matchMethod: string
  matchProtocol: string
  matchHost: string
  matchPath: string
  matchRequestHeaders: [string, string][]
  matchQuery: [string, string][]
  matchRequestBody: string
  mapRemoteEnabled: boolean
  mapRemoteProtocol: string
  mapRemoteHost: string
  mapRemotePath: string
  streamEnabled: boolean
  streamIntervalMs: number
}

export type WsMessage =
  | { type: 'snapshot'; requests: TrafficEntrySummary[] }
  | { type: 'traffic'; entry: TrafficEntrySummary }
  | { type: 'overrides_updated' }
  | { type: 'breakpoints_updated' }
  | {
      type: 'proxy_listen_updated'
      proxyListenIpv4?: string | null
      proxyPort: number
    }
  | {
      type: 'ui_action'
      action:
        | { action: 'focus_main_window' }
        | { action: 'open_floating_traffic_window' }
        | { action: 'select_request'; requestId: string }
        | { action: 'set_url_filter'; query: string }
    }
