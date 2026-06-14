import type { HostGroup } from '@/components/host-group-list/HostGroupList'
import type { BreakpointRule } from '../../types'

/** 无 origin 限定的断点归入「任意域名」分组。 */
export const ANY_ORIGIN_LABEL = '* (any origin)'

function originKey(rule: BreakpointRule): string {
  const origin = (rule.matchOrigin ?? '').trim()
  return origin || ANY_ORIGIN_LABEL
}

function compareOrigin(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

function compareByName(a: BreakpointRule, b: BreakpointRule): number {
  const c = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  if (c !== 0) return c
  return a.id.localeCompare(b.id, undefined, { sensitivity: 'base' })
}

/**
 * 按 origin（域名）对断点规则分组；组内按名称排序，组之间按 origin 字典序排列。
 */
export function buildBreakpointGroups(
  rules: BreakpointRule[],
): HostGroup<BreakpointRule>[] {
  const groupMap = new Map<string, BreakpointRule[]>()
  for (const rule of rules) {
    const origin = originKey(rule)
    if (!groupMap.has(origin)) groupMap.set(origin, [])
    groupMap.get(origin)!.push(rule)
  }
  const groups: HostGroup<BreakpointRule>[] = []
  for (const [host, items] of groupMap) {
    groups.push({ host, items: [...items].sort(compareByName) })
  }
  groups.sort((a, b) => compareOrigin(a.host, b.host))
  return groups
}
