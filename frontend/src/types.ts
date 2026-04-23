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

export interface OverrideRule {
  id: string
  name: string
  enabled: boolean
  matchMethod?: string | null
  matchHost?: string | null
  matchPathRegex?: string | null
  status: number
  headers: [string, string][]
  body: string
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
  name: string
  enabled: boolean
  status: number
  body: string
  headersText: string
  matchMethod: string
  matchHost: string
  matchPathRegex: string
  streamEnabled: boolean
  streamIntervalMs: number
}

export type WsMessage =
  | { type: 'snapshot'; requests: TrafficEntry[] }
  | { type: 'traffic'; entry: TrafficEntry }
  | { type: 'overrides_updated' }
  | { type: 'breakpoints_updated' }
