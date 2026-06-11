import { useCallback, useMemo, useState, type SetStateAction } from 'react'
import type { TrafficEntry } from '../../../types'
import { trimTrafficEntries } from '../trafficEntriesLimit'
import {
  EMPTY_TRAFFIC_FILTERS,
  entryMatchesTrafficFilters,
  hasActiveTrafficFilters,
  type TrafficFilterGroupKey,
  type TrafficFilters,
} from '../trafficFilter'

const FILTER_TOKEN_SPLIT_REGEX = /[\s,]+/

function parseFilterKeywords(raw: string): string[] {
  const dedupedKeywords = new Set(
    raw
      .split(FILTER_TOKEN_SPLIT_REGEX)
      .map((keyword) => keyword.trim().toLowerCase())
      .filter((keyword) => keyword.length > 0),
  )
  return [...dedupedKeywords]
}

export function useTrafficState() {
  const [entries, setEntriesRaw] = useState<TrafficEntry[]>([])

  const setEntries = useCallback((action: SetStateAction<TrafficEntry[]>) => {
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
  const [resumeSaving, setResumeSaving] = useState<Record<string, boolean>>({})
  const [streamActionSaving, setStreamActionSaving] = useState<Record<string, boolean>>(
    {},
  )

  const urlFilterTrimmed = urlFilter.trim()
  const inputKeywords = useMemo(() => parseFilterKeywords(urlFilter), [urlFilter])
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
    setUrlFilterTags(parseFilterKeywords(query))
  }, [])

  const commitUrlFilterInputAsTag = useCallback(() => {
    if (!urlFilterTrimmed) return
    const newKeywords = parseFilterKeywords(urlFilterTrimmed)
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

  const filteredEntries = useMemo(() => {
    const hasKeywordFilter = activeFilterKeywords.length > 0
    if (!hasKeywordFilter && !hasTrafficFilters) return entries
    return entries.filter((entry) => {
      if (hasKeywordFilter) {
        const urlLowerCase = entry.url.toLowerCase()
        const matchesKeyword = activeFilterKeywords.some((keyword) =>
          urlLowerCase.includes(keyword),
        )
        if (!matchesKeyword) return false
      }
      return entryMatchesTrafficFilters(entry, trafficFilters)
    })
  }, [activeFilterKeywords, entries, hasTrafficFilters, trafficFilters])

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  )

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
    setSelectedId(null)
  }, [setEntries])

  const resumeRequest = useCallback(async (id: string) => {
    setResumeSaving((prev) => ({ ...prev, [id]: true }))
    try {
      const r = await fetch(`/api/requests/${id}/resume`, { method: 'POST' })
      if (!r.ok) throw new Error(`Resume failed (HTTP ${r.status})`)
    } catch (e) {
      window.alert(String(e))
    } finally {
      setResumeSaving((prev) => ({ ...prev, [id]: false }))
    }
  }, [])

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
    setEntries,
    selectedId,
    setSelectedId,
    urlFilter,
    setUrlFilter,
    setUrlFilterFromQuery,
    urlFilterTags,
    commitUrlFilterInputAsTag,
    removeUrlFilterTag,
    popUrlFilterTag,
    trafficFilters,
    toggleTrafficFilterValue,
    clearTrafficFilters,
    hasTrafficFilters,
    testError,
    setTestError,
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
