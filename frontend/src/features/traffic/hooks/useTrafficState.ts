import { useCallback, useEffect, useMemo, useState, type SetStateAction } from 'react'
import type { TrafficEntry, TrafficEntrySummary } from '../../../types'
import { trimTrafficEntries } from '../trafficEntriesLimit'
import {
  EMPTY_TRAFFIC_FILTERS,
  entryMatchesUrlKeywords,
  entryMatchesTrafficFilters,
  getRequesterAppName,
  hasActiveTrafficFilters,
  parseTrafficFilterKeywords,
  type TrafficFilterGroupKey,
  type TrafficFilters,
} from '../trafficFilter'

export function useTrafficState() {
  const [entries, setEntriesRaw] = useState<TrafficEntrySummary[]>([])
  const [selectedDetail, setSelectedDetail] = useState<TrafficEntry | null>(null)

  const setEntries = useCallback((action: SetStateAction<TrafficEntrySummary[]>) => {
    setEntriesRaw((prev) => {
      const next = typeof action === 'function' ? action(prev) : action
      return trimTrafficEntries(next)
    })
  }, [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [urlFilter, setUrlFilter] = useState('')
  const [urlFilterTags, setUrlFilterTags] = useState<string[]>([])
  const [trafficFilters, setTrafficFilters] =
    useState<TrafficFilters>(EMPTY_TRAFFIC_FILTERS)
  const [testError, setTestError] = useState<string | null>(null)
  const [highlightedEntryIds, setHighlightedEntryIds] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  )
  const [resumeSaving, setResumeSaving] = useState<Record<string, boolean>>({})
  const [streamActionSaving, setStreamActionSaving] = useState<Record<string, boolean>>(
    {},
  )

  const urlFilterTrimmed = urlFilter.trim()
  const inputKeywords = useMemo(() => parseTrafficFilterKeywords(urlFilter), [urlFilter])
  const activeFilterKeywords = useMemo(() => {
    const dedupedKeywords = new Set<string>()
    for (const keyword of urlFilterTags) {
      dedupedKeywords.add(keyword)
    }
    for (const keyword of inputKeywords) {
      dedupedKeywords.add(keyword)
    }
    return [...dedupedKeywords]
  }, [inputKeywords, urlFilterTags])

  const setUrlFilterFromQuery = useCallback((query: string) => {
    setUrlFilter('')
    setUrlFilterTags(parseTrafficFilterKeywords(query))
  }, [])

  const commitUrlFilterInputAsTag = useCallback(() => {
    if (!urlFilterTrimmed) return
    const newKeywords = parseTrafficFilterKeywords(urlFilterTrimmed)
    if (newKeywords.length === 0) return
    setUrlFilterTags((prev) => {
      const dedupedKeywords = new Set(prev)
      for (const keyword of newKeywords) {
        dedupedKeywords.add(keyword)
      }
      return [...dedupedKeywords]
    })
    setUrlFilter('')
  }, [urlFilterTrimmed])

  const removeUrlFilterTag = useCallback((keyword: string) => {
    const normalizedKeyword = keyword.trim().toLowerCase()
    if (!normalizedKeyword) return
    setUrlFilterTags((prev) =>
      prev.filter((existingKeyword) => existingKeyword !== normalizedKeyword),
    )
  }, [])

  const popUrlFilterTag = useCallback(() => {
    setUrlFilterTags((prev) => prev.slice(0, -1))
  }, [])

  const toggleTrafficFilterValue = useCallback(
    (group: TrafficFilterGroupKey, value: string) => {
      setTrafficFilters((prev) => {
        const groupValues = prev[group]
        const nextGroupValues = groupValues.includes(value)
          ? groupValues.filter((existingValue) => existingValue !== value)
          : [...groupValues, value]
        return { ...prev, [group]: nextGroupValues }
      })
    },
    [],
  )

  const clearTrafficFilters = useCallback(() => {
    setTrafficFilters(EMPTY_TRAFFIC_FILTERS)
  }, [])

  const hasTrafficFilters = hasActiveTrafficFilters(trafficFilters)
  const entryById = useMemo(() => {
    const indexedEntries = new Map<string, TrafficEntrySummary>()
    for (const entry of entries) {
      indexedEntries.set(entry.id, entry)
    }
    return indexedEntries
  }, [entries])
  const availableRequesterApps = useMemo(() => {
    const requesterAppNameByNormalized = new Map<string, string>()
    for (const entry of entries) {
      const requesterAppName = getRequesterAppName(entry).trim()
      if (!requesterAppName || requesterAppName === '—') continue
      const normalizedRequesterAppName = requesterAppName.toLowerCase()
      if (requesterAppNameByNormalized.has(normalizedRequesterAppName)) continue
      requesterAppNameByNormalized.set(normalizedRequesterAppName, requesterAppName)
    }
    return [...requesterAppNameByNormalized.values()].sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: 'base' }),
    )
  }, [entries])

  const filteredEntries = useMemo(() => {
    const hasKeywordFilter = activeFilterKeywords.length > 0
    if (!hasKeywordFilter && !hasTrafficFilters) return entries
    return entries.filter((entry) => {
      if (hasKeywordFilter) {
        if (!entryMatchesUrlKeywords(entry, activeFilterKeywords)) return false
      }
      return entryMatchesTrafficFilters(entry, trafficFilters)
    })
  }, [activeFilterKeywords, entries, hasTrafficFilters, trafficFilters])

  const selected = useMemo(
    () => (selectedDetail?.id === selectedId ? selectedDetail : null),
    [selectedDetail, selectedId],
  )
  const selectedSummary = useMemo(
    () => (selectedId ? entryById.get(selectedId) ?? null : null),
    [entryById, selectedId],
  )

  useEffect(() => {
    if (!selectedId || !selectedSummary) {
      setSelectedDetail(null)
      return
    }
    const controller = new AbortController()
    let isCancelled = false
    async function loadSelectedDetail() {
      try {
        const response = await fetch(`/api/requests/${selectedId}`, {
          signal: controller.signal,
        })
        if (!response.ok || isCancelled) {
          if (!isCancelled) setSelectedDetail(null)
          return
        }
        const detail = (await response.json()) as TrafficEntry
        if (!isCancelled) {
          setSelectedDetail(detail)
        }
      } catch (error) {
        if (!controller.signal.aborted && !isCancelled) {
          setSelectedDetail(null)
        }
      }
    }
    void loadSelectedDetail()
    return () => {
      isCancelled = true
      controller.abort()
    }
  }, [selectedId, selectedSummary])

  const selectedResponseContentType = useMemo(() => {
    if (!selected?.responseHeaders) return ''
    const h = selected.responseHeaders.find(
      ([k]) => k.toLowerCase() === 'content-type',
    )
    return h?.[1]?.toLowerCase() ?? ''
  }, [selected])

  const selectedIsEventStream =
    selectedResponseContentType.includes('text/event-stream')

  const clearTraffic = useCallback(async () => {
    await fetch('/api/requests', { method: 'DELETE' })
    setEntries([])
    setHighlightedEntryIds(new Set<string>())
    setSelectedId(null)
    setSelectedDetail(null)
  }, [setEntries])

  const toggleEntryHighlight = useCallback((id: string) => {
    setHighlightedEntryIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const resumeRequest = useCallback(async (id: string) => {
    setResumeSaving((prev) => ({ ...prev, [id]: true }))
    try {
      const r = await fetch(`/api/requests/${id}/resume`, { method: 'POST' })
      if (!r.ok) throw new Error(`Resume failed (HTTP ${r.status})`)
      setEntries((prev) =>
        prev.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                pending: false,
                breakpointName: null,
                breakpointMatchId: null,
              }
            : entry,
        ),
      )
    } catch (e) {
      window.alert(String(e))
    } finally {
      setResumeSaving((prev) => ({ ...prev, [id]: false }))
    }
  }, [setEntries])

  const playControlledStream = useCallback(async (id: string) => {
    setStreamActionSaving((prev) => ({ ...prev, [id]: true }))
    try {
      const r = await fetch(`/api/requests/${id}/stream/play`, { method: 'POST' })
      if (!r.ok) throw new Error(`Play failed (HTTP ${r.status})`)
    } catch (e) {
      window.alert(String(e))
    } finally {
      setStreamActionSaving((prev) => ({ ...prev, [id]: false }))
    }
  }, [])

  const pauseControlledStream = useCallback(async (id: string) => {
    setStreamActionSaving((prev) => ({ ...prev, [id]: true }))
    try {
      const r = await fetch(`/api/requests/${id}/stream/pause`, { method: 'POST' })
      if (!r.ok) throw new Error(`Pause failed (HTTP ${r.status})`)
    } catch (e) {
      window.alert(String(e))
    } finally {
      setStreamActionSaving((prev) => ({ ...prev, [id]: false }))
    }
  }, [])


  return {
    entries,
    entryById,
    setEntries,
    selectedId,
    setSelectedId,
    urlFilter,
    setUrlFilter,
    setUrlFilterFromQuery,
    urlFilterTags,
    activeFilterKeywords,
    commitUrlFilterInputAsTag,
    removeUrlFilterTag,
    popUrlFilterTag,
    trafficFilters,
    toggleTrafficFilterValue,
    clearTrafficFilters,
    hasTrafficFilters,
    availableRequesterApps,
    testError,
    setTestError,
    highlightedEntryIds,
    toggleEntryHighlight,
    urlFilterTrimmed,
    filteredEntries,
    selected,
    selectedIsEventStream,
    clearTraffic,
    resumeRequest,
    resumeSaving,
    streamActionSaving,
    playControlledStream,
    pauseControlledStream,
  }
}

export type TrafficState = ReturnType<typeof useTrafficState>
