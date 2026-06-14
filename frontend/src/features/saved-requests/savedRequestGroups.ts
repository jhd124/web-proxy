import type { HostGroup } from '@/components/host-group-list/HostGroupList'
import type { SavedRequest } from '../../types'

const UNKNOWN_HOST = 'unknown'

function hostKey(request: SavedRequest): string {
  const host = (request.entry.host ?? '').trim()
  if (host) return host
  try {
    return new URL(request.entry.url).host || UNKNOWN_HOST
  } catch {
    return UNKNOWN_HOST
  }
}

function compareHost(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' })
}

/**
 * 按域名（host）对已保存请求分组；组内保持原有顺序（一般为保存时间倒序），
 * 组之间按 host 字典序排列。
 */
export function buildSavedRequestGroups(
  savedRequests: SavedRequest[],
): HostGroup<SavedRequest>[] {
  const groupMap = new Map<string, SavedRequest[]>()
  for (const request of savedRequests) {
    const host = hostKey(request)
    if (!groupMap.has(host)) groupMap.set(host, [])
    groupMap.get(host)!.push(request)
  }
  const groups: HostGroup<SavedRequest>[] = []
  for (const [host, items] of groupMap) {
    groups.push({ host, items })
  }
  groups.sort((a, b) => compareHost(a.host, b.host))
  return groups
}
