import { normalizePath } from '../../lib/dashboardUtils'
import type { OverrideRule } from '../../types'

/** Path trie: internal nodes are path segments, leaves hold rules for that full path. */
export type PathNode = {
  children: Map<string, PathNode>
  rules: OverrideRule[]
}

function emptyNode(): PathNode {
  return { children: new Map(), rules: [] }
}

function hasHostname(r: OverrideRule): boolean {
  return (r.matchHost ?? '').trim().length > 0
}

function hostKey(r: OverrideRule): string {
  return (r.matchHost ?? '').trim()
}

function compareHost(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

/** Segments for trie insert; same rules as `normalizePath` in the app. */
function pathSegmentsFromMatchPath(
  path: string | null | undefined,
): string[] {
  const n = normalizePath(path ?? '')
  if (n === '/') return []
  return n
    .slice(1)
    .split('/')
    .filter((p) => p.length > 0)
}

function insertPath(root: PathNode, segments: string[], rule: OverrideRule): void {
  if (segments.length === 0) {
    root.rules.push(rule)
    return
  }
  const [head, ...rest] = segments
  if (!root.children.has(head)) {
    root.children.set(head, emptyNode())
  }
  insertPath(root.children.get(head)!, rest, rule)
}

/**
 * Group overrides by hostname (only rules with a non-empty host are included).
 */
export function buildPathGroups(
  overrides: OverrideRule[],
): { host: string; root: PathNode }[] {
  const m = new Map<string, OverrideRule[]>()
  for (const o of overrides) {
    if (!hasHostname(o)) continue
    const h = hostKey(o)
    if (!m.has(h)) m.set(h, [])
    m.get(h)!.push(o)
  }
  const out: { host: string; root: PathNode }[] = []
  for (const [host, list] of m) {
    const root = emptyNode()
    for (const r of list) {
      insertPath(root, pathSegmentsFromMatchPath(r.matchPath), r)
    }
    sortRulesInTree(root)
    out.push({ host, root })
  }
  out.sort((a, b) => compareHost(a.host, b.host))
  return out
}

export function formatPathPrefix(pathPrefix: string[]): string {
  if (pathPrefix.length === 0) return '/'
  return `/${pathPrefix.join('/')}`
}

/** One-line label for UI lists (no stored display name on rules). */
export function overrideListLabel(o: OverrideRule): string {
  const p = (o.matchPath ?? '').trim()
  return p.trim() || '/'
}

function compareRuleById(a: OverrideRule, b: OverrideRule): number {
  return a.id.localeCompare(b.id, undefined, { sensitivity: 'base' })
}

export function sortRulesInTree(node: PathNode): void {
  node.rules.sort(compareRuleById)
  for (const child of node.children.values()) {
    sortRulesInTree(child)
  }
}
