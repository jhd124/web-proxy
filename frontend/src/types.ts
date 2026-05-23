export type TrafficKind = 'http' | 'connect'

export interface TrafficEntry {
  id: string
  at: string
  /** Client socket that connected to the proxy */
  peer: string
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
  streamControllable: boolean
  streamPlaying?: boolean | null
}

export interface SavedRequest {
  id: string
  savedAt: string
  entry: TrafficEntry
}

export interface OverrideRule {
  id: string
  enabled: boolean
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
  matchOrigin?: string | null
  matchPathRegex?: string | null
}

/** Editable state for the override full-screen editor (form + Monaco). */
export interface OverrideFormState {
  enabled: boolean
  status: number
  body: string
  headersText: string
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
  | { type: 'snapshot'; requests: TrafficEntry[] }
  | { type: 'traffic'; entry: TrafficEntry }
  | { type: 'overrides_updated' }
  | { type: 'breakpoints_updated' }
