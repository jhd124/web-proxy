import type { BreakpointRule, OverrideFormState, TrafficEntry } from '../types'

/** Default matches Rust `DASHBOARD_PORT` (and Vite’s `/ws` target). */
const DASHBOARD_DEV_WS_PORT = '9091'

/** Dev: WebSocket to Axum on localhost, not through Vite’s proxy. */
export const wsUrl = () => {
  if (import.meta.env.DEV) {
    const port = import.meta.env.VITE_DASHBOARD_PORT ?? DASHBOARD_DEV_WS_PORT
    return `ws://127.0.0.1:${port}/ws`
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function headersToText(
  headers: [string, string][] | null | undefined,
): string {
  if (!headers?.length) return ''
  return headers.map(([k, v]) => `${k}: ${v}`).join('\n')
}

export function parseHeadersText(text: string): [string, string][] {
  const out: [string, string][] = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const i = t.indexOf(':')
    if (i <= 0) continue
    out.push([t.slice(0, i).trim(), t.slice(i + 1).trim()])
  }
  return out
}

export function getDefaultOverrideForm(): OverrideFormState {
  return {
    enabled: true,
    status: 200,
    body: '',
    headersText: '',
    matchProtocol: '',
    matchHost: '',
    matchPath: '',
    matchRequestHeaders: [],
    matchQuery: [],
    matchRequestBody: '',
    streamEnabled: false,
    streamIntervalMs: 500,
  }
}

/** True iff `f` matches `getDefaultOverrideForm()` (fresh call, field-wise). */
export function isDefaultOverrideForm(f: OverrideFormState): boolean {
  const d = getDefaultOverrideForm()
  return (
    f.enabled === d.enabled &&
    f.status === d.status &&
    f.body === d.body &&
    f.headersText === d.headersText &&
    f.matchProtocol === d.matchProtocol &&
    f.matchHost === d.matchHost &&
    f.matchPath === d.matchPath &&
    f.matchRequestBody === d.matchRequestBody &&
    f.streamEnabled === d.streamEnabled &&
    f.streamIntervalMs === d.streamIntervalMs &&
    f.matchRequestHeaders.length === 0 &&
    f.matchQuery.length === 0
  )
}

/** Same rules as the proxy: trim, default empty to `/`, ensure leading `/`. */
export function normalizePath(p: string): string {
  const t = p.trim()
  if (t === '') return '/'
  return t.startsWith('/') ? t : `/${t}`
}

/** Values to pre-fill request match fields from a captured traffic row. */
export function urlMatchPartsForForm(entry: TrafficEntry): {
  matchProtocol: string
  matchHost: string
  matchPath: string
  matchQuery: [string, string][]
} {
  try {
    const u = new URL(entry.url)
    const matchQuery: [string, string][] = []
    u.searchParams.forEach((v, k) => {
      matchQuery.push([k, v])
    })
    return {
      matchProtocol: u.protocol.replace(':', ''),
      matchHost: u.host,
      matchPath: u.pathname,
      matchQuery,
    }
  } catch {
    const pathOnly = entry.path.split('?')[0] ?? entry.path
    return {
      matchProtocol: entry.scheme,
      matchHost: entry.host,
      matchPath: normalizePath(pathOnly),
      matchQuery: [],
    }
  }
}

export function urlOrigin(u: string): string {
  try {
    return new URL(u).origin
  } catch {
    return ''
  }
}

export function inferOriginFromHostHint(
  hostHint: string | null | undefined,
): string {
  const value = (hostHint ?? '').trim()
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value
  }
  return ''
}

export function breakpointMatches(
  rule: BreakpointRule,
  entry: TrafficEntry,
): boolean {
  const origin = urlOrigin(entry.url)
  if (
    rule.matchOrigin &&
    rule.matchOrigin.toLowerCase() !== origin.toLowerCase()
  ) {
    return false
  }
  if (!rule.matchPathRegex) return true
  try {
    return new RegExp(rule.matchPathRegex).test(entry.path)
  } catch {
    return false
  }
}
