import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SavedRequest, TrafficEntry } from '../../../types'
import type { SavedRequestState } from '../types'

async function fetchSavedRequests(): Promise<SavedRequest[]> {
  const response = await fetch('/api/saved-requests')
  if (!response.ok) {
    throw new Error(`Load saved requests failed (HTTP ${response.status})`)
  }
  return (await response.json()) as SavedRequest[]
}

export function useSavedRequests(): SavedRequestState {
  const [savedRequests, setSavedRequests] = useState<SavedRequest[]>([])
  const [selectedSavedRequestId, setSelectedSavedRequestIdState] = useState<
    string | null
  >(null)

  useEffect(() => {
    let cancelled = false
    async function loadSavedRequests() {
      try {
        const loadedRequests = await fetchSavedRequests()
        if (cancelled) return
        setSavedRequests(loadedRequests)
        setSelectedSavedRequestIdState(loadedRequests[0]?.id ?? null)
      } catch (e) {
        if (!cancelled) {
          window.alert(String(e))
        }
      }
    }
    void loadSavedRequests()
    return () => {
      cancelled = true
    }
  }, [])

  const selectedSavedRequest = useMemo(
    () =>
      savedRequests.find((request) => request.id === selectedSavedRequestId) ??
      savedRequests[0] ??
      null,
    [savedRequests, selectedSavedRequestId],
  )

  const setSelectedSavedRequestId = useCallback((id: string) => {
    setSelectedSavedRequestIdState(id)
  }, [])

  const saveRequest = useCallback(async (entry: TrafficEntry) => {
    const response = await fetch('/api/saved-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    })
    if (!response.ok) {
      throw new Error(`Save request failed (HTTP ${response.status})`)
    }
    const savedRequest = (await response.json()) as SavedRequest
    setSavedRequests((prev) => [
        savedRequest,
        ...prev.filter((request) => request.id !== entry.id),
      ])
    setSelectedSavedRequestIdState(entry.id)
  }, [])

  const isRequestSaved = useCallback(
    (id: string) => savedRequests.some((request) => request.id === id),
    [savedRequests],
  )

  const removeSavedRequest = useCallback(
    async (id: string) => {
      const response = await fetch(`/api/saved-requests/${id}`, {
        method: 'DELETE',
      })
      if (!response.ok && response.status !== 404) {
        throw new Error(`Delete saved request failed (HTTP ${response.status})`)
      }
      const nextSelectedId =
        savedRequests.find((request) => request.id !== id)?.id ?? null
      setSavedRequests((prev) => prev.filter((request) => request.id !== id))
      setSelectedSavedRequestIdState((selectedId) =>
        selectedId === id ? nextSelectedId : selectedId,
      )
    },
    [savedRequests],
  )

  const clearSavedRequests = useCallback(async () => {
    const response = await fetch('/api/saved-requests', { method: 'DELETE' })
    if (!response.ok) {
      throw new Error(`Clear saved requests failed (HTTP ${response.status})`)
    }
    setSavedRequests([])
    setSelectedSavedRequestIdState(null)
  }, [])

  return {
    savedRequests,
    selectedSavedRequestId,
    selectedSavedRequest,
    setSelectedSavedRequestId,
    saveRequest,
    isRequestSaved,
    removeSavedRequest,
    clearSavedRequests,
  }
}
