import { useCallback, useMemo, useState } from 'react'
import type { TrafficEntry } from '../../../types'

export function useTrafficState() {
  const [entries, setEntries] = useState<TrafficEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [urlFilter, setUrlFilter] = useState('')
  const [testError, setTestError] = useState<string | null>(null)
  const [resumeSaving, setResumeSaving] = useState<Record<string, boolean>>({})
  const [streamActionSaving, setStreamActionSaving] = useState<Record<string, boolean>>(
    {},
  )

  const urlFilterTrimmed = urlFilter.trim()
  const filteredEntries = useMemo(() => {
    if (!urlFilterTrimmed) return entries
    const q = urlFilterTrimmed.toLowerCase()
    return entries.filter((e) => e.url.toLowerCase().includes(q))
  }, [entries, urlFilterTrimmed])

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
  }, [])

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

  const sendTestProxy = useCallback(async () => {
    setTestError(null)
    try {
      const r = await fetch('/api/self-test', { method: 'POST' })
      const j = (await r.json()) as { ok?: boolean; error?: string }
      if (!r.ok || !j.ok) {
        setTestError(j.error ?? `HTTP ${r.status}`)
      }
    } catch (e) {
      setTestError(String(e))
    }
  }, [])

  return {
    entries,
    setEntries,
    selectedId,
    setSelectedId,
    urlFilter,
    setUrlFilter,
    testError,
    setTestError,
    urlFilterTrimmed,
    filteredEntries,
    selected,
    selectedIsEventStream,
    clearTraffic,
    sendTestProxy,
    resumeRequest,
    resumeSaving,
    streamActionSaving,
    playControlledStream,
    pauseControlledStream,
  }
}

export type TrafficState = ReturnType<typeof useTrafficState>
