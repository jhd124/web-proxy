import { useCallback, useEffect, useMemo, useState } from 'react'
import { showSuccessToast, showToast } from '../../../lib/toast'
import type { HostsState, ManagedHostEntry } from '../../../types'
import {
  applyHostsDirectly,
  fetchHostsState,
  revertHostsDirectly,
  saveHostsEntries,
} from '../apis'
import { hostsTexts as t } from '../texts'

const EMPTY_ENTRY: ManagedHostEntry = {
  address: '127.0.0.1',
  hostname: '',
  enabled: true,
  comment: '',
}

export type HostsManagerViewModel = {
  state: HostsState | null
  entries: ManagedHostEntry[]
  isDirty: boolean
  isLoading: boolean
  isSaving: boolean
  isApplying: boolean
  isReverting: boolean
  addEntry: () => void
  updateEntry: (
    index: number,
    field: keyof ManagedHostEntry,
    value: string | boolean,
  ) => void
  removeEntry: (index: number) => void
  saveEntries: () => Promise<HostsState | null>
  applyHosts: () => Promise<void>
  revertHosts: () => Promise<void>
  reload: () => Promise<void>
}

export function useHostsManager(): HostsManagerViewModel {
  const [state, setState] = useState<HostsState | null>(null)
  const [entries, setEntries] = useState<ManagedHostEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [isReverting, setIsReverting] = useState(false)

  const isDirty = useMemo(
    () => JSON.stringify(entries) !== JSON.stringify(state?.entries ?? []),
    [entries, state],
  )

  const loadHosts = useCallback(async (signal?: AbortSignal) => {
    const nextState = await fetchHostsState(signal)
    setState(nextState)
    setEntries(nextState.entries)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    async function loadInitialHosts() {
      setIsLoading(true)
      try {
        await loadHosts(controller.signal)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        const detail = error instanceof Error ? error.message : String(error)
        showToast(t.loadFailed(detail), 'error')
      } finally {
        setIsLoading(false)
      }
    }
    void loadInitialHosts()
    return () => controller.abort()
  }, [loadHosts])

  const addEntry = useCallback(() => {
    setEntries((currentEntries) => [...currentEntries, { ...EMPTY_ENTRY }])
  }, [])

  const updateEntry = useCallback(
    (index: number, field: keyof ManagedHostEntry, value: string | boolean) => {
      setEntries((currentEntries) =>
        currentEntries.map((entry, entryIndex) =>
          entryIndex === index ? { ...entry, [field]: value } : entry,
        ),
      )
    },
    [],
  )

  const removeEntry = useCallback((index: number) => {
    setEntries((currentEntries) =>
      currentEntries.filter((_, entryIndex) => entryIndex !== index),
    )
  }, [])

  const saveEntries = useCallback(async (): Promise<HostsState | null> => {
    setIsSaving(true)
    try {
      const nextState = await saveHostsEntries(entries)
      setState(nextState)
      setEntries(nextState.entries)
      showSuccessToast(t.saveSuccess)
      return nextState
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      showToast(t.saveFailed(detail), 'error')
      return null
    } finally {
      setIsSaving(false)
    }
  }, [entries])

  const applyHosts = useCallback(async () => {
    setIsApplying(true)
    try {
      const savedState = isDirty ? await saveHostsEntries(entries) : state
      if (savedState) {
        setState(savedState)
        setEntries(savedState.entries)
      }
      const nextState = await applyHostsDirectly()
      setState(nextState)
      setEntries(nextState.entries)
      showSuccessToast(t.applySuccess)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      showToast(t.applyFailed(detail), 'error')
    } finally {
      setIsApplying(false)
    }
  }, [entries, isDirty, loadHosts, state])

  const revertHosts = useCallback(async () => {
    setIsReverting(true)
    try {
      const nextState = await revertHostsDirectly()
      setState(nextState)
      setEntries(nextState.entries)
      showSuccessToast(t.revertSuccess)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      showToast(t.revertFailed(detail), 'error')
    } finally {
      setIsReverting(false)
    }
  }, [])

  const reload = useCallback(async () => {
    setIsLoading(true)
    try {
      await loadHosts()
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      showToast(t.loadFailed(detail), 'error')
    } finally {
      setIsLoading(false)
    }
  }, [loadHosts])

  return {
    state,
    entries,
    isDirty,
    isLoading,
    isSaving,
    isApplying,
    isReverting,
    addEntry,
    updateEntry,
    removeEntry,
    saveEntries,
    applyHosts,
    revertHosts,
    reload,
  }
}
