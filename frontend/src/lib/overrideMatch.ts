import type { OverrideRule, TrafficEntry } from '../types'
import { normalizePath } from './dashboardUtils'

function pathOnly(p: string): string {
  const i = p.indexOf('?')
  return i === -1 ? p : p.slice(0, i)
}

function requestHeadersSatisfied(
  request: [string, string][],
  rules: [string, string][],
): boolean {
  for (const [rk, rv] of rules) {
    const rkl = rk.toLowerCase()
    let any = false
    for (const [name, val] of request) {
      if (name.toLowerCase() === rkl) {
        if (rv === '') {
          any = true
          break
        }
        if (val === rv) {
          any = true
          break
        }
      }
    }
    if (!any) return false
  }
  return true
}

function querySatisfied(
  request: [string, string][],
  rules: [string, string][],
): boolean {
  for (const [k, v] of rules) {
    let any = false
    for (const [qk, qv] of request) {
      if (qk === k) {
        if (v === '') {
          any = true
          break
        }
        if (qv === v) {
          any = true
          break
        }
      }
    }
    if (!any) return false
  }
  return true
}

/** URLSearchParams order for query pairs from a URL */
export function queryPairsFromUrlString(url: string): [string, string][] {
  try {
    const u = new URL(url)
    const out: [string, string][] = []
    u.searchParams.forEach((v, k) => {
      out.push([k, v])
    })
    return out
  } catch {
    return []
  }
}

export function pathOnlyFromEntry(entry: TrafficEntry): string {
  let fromUrl = entry.path
  try {
    fromUrl = new URL(entry.url).pathname
  } catch {
    fromUrl = pathOnly(entry.path)
  }
  return normalizePath(fromUrl)
}

/**
 * Best-effort mirror of the proxy's `OverrideRule::matches` for dashboard selection.
 * Request body: compares to `requestBodyPreview` when the rule matches on body
 * (may differ from the proxy if the body was truncated in the log).
 */
export function trafficEntryMatchesOverride(
  entry: TrafficEntry,
  r: OverrideRule,
): boolean {
  if (entry.kind !== 'http' || !r.enabled) return false
  if (!r.matchHost?.trim()) return false
  if (entry.host.toLowerCase() !== r.matchHost.trim().toLowerCase()) {
    return false
  }
  if (r.matchProtocol && r.matchProtocol.toLowerCase() !== entry.scheme.toLowerCase()) {
    return false
  }
  if (r.matchPath && r.matchPath.trim() !== '') {
    if (normalizePath(pathOnlyFromEntry(entry)) !== normalizePath(r.matchPath)) {
      return false
    }
  }
  const mrh: [string, string][] = r.matchRequestHeaders ?? []
  if (mrh.length > 0 && !requestHeadersSatisfied(entry.requestHeaders ?? [], mrh)) {
    return false
  }
  const mq: [string, string][] = r.matchQuery ?? []
  if (mq.length > 0) {
    const q = queryPairsFromUrlString(entry.url)
    if (!querySatisfied(q, mq)) return false
  }
  if (r.matchRequestBody && r.matchRequestBody.trim() !== '') {
    const preview = entry.requestBodyPreview ?? ''
    if (preview !== r.matchRequestBody) return false
  }
  return true
}
