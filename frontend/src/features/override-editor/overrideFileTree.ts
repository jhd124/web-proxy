import { normalizePath } from '../../lib/dashboardUtils'
import type { OverrideRule } from '../../types'

function hasHostname(r: OverrideRule): boolean {
  return (r.matchHost ?? '').trim().length > 0
}

function hostKey(r: OverrideRule): string {
  return (r.matchHost ?? '').trim()
}

function compareHost(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

function compareByPath(a: OverrideRule, b: OverrideRule): number {
  const pa = normalizePath(a.matchPath ?? '')
  const pb = normalizePath(b.matchPath ?? '')
  const c = pa.localeCompare(pb, undefined, { sensitivity: 'base' })
  if (c !== 0) return c
  return a.id.localeCompare(b.id, undefined, { sensitivity: 'base' })
}

/**
 * Group overrides by hostname (only rules with a non-empty host are included).
 * Groups are ordered by host; within each group, rules are ordered by path (lexicographic).
 */
export function buildPathGroups(overrides: OverrideRule[]): {
  host: string
  rules: OverrideRule[]
}[] {
  const m = new Map<string, OverrideRule[]>()
  for (const o of overrides) {
    if (!hasHostname(o)) continue
    const h = hostKey(o)
    if (!m.has(h)) m.set(h, [])
    m.get(h)!.push(o)
  }
  const out: { host: string; rules: OverrideRule[] }[] = []
  for (const [host, list] of m) {
    out.push({ host, rules: [...list].sort(compareByPath) })
  }
  out.sort((a, b) => compareHost(a.host, b.host))
  return out
}

/** One-line label for UI lists (no stored display name on rules). */
export function overrideListLabel(o: OverrideRule): string {
  const p = (o.matchPath ?? '').trim()
  return p.trim() || '/'
}
