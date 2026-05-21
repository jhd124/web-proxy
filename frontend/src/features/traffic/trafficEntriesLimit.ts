import type { TrafficEntry } from '../../types'

/** 与后端 MAX_TRAFFIC 默认值保持一致 */
export const MAX_TRAFFIC_ENTRIES = 20_000

export function trimTrafficEntries(entries: TrafficEntry[]): TrafficEntry[] {
  if (entries.length <= MAX_TRAFFIC_ENTRIES) return entries
  return entries.slice(entries.length - MAX_TRAFFIC_ENTRIES)
}
