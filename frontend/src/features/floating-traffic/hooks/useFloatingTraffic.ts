import { focusMainWindow } from '@/lib/focusMainWindow'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppWebSocket } from '../../dashboard/hooks/useAppWebSocket'
import { useTrafficState } from '../../traffic/hooks/useTrafficState'
import { floatingTrafficTexts as t } from '../texts'

export function useFloatingTraffic() {
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting',
  )
  const traffic = useTrafficState()
  const selectedIdRef = useRef<string | null>(null)

  useEffect(() => {
    selectedIdRef.current = traffic.selectedId
  }, [traffic.selectedId])

  const selected = useMemo(
    () => traffic.entries.find((entry) => entry.id === traffic.selectedId) ?? null,
    [traffic.entries, traffic.selectedId],
  )

  const refreshFloatingData = useCallback(async () => {
    await Promise.resolve()
  }, [])

  useAppWebSocket({
    setEntries: traffic.setEntries,
    selectedIdRef,
    setSelectedId: traffic.setSelectedId,
    setWsStatus,
    setUrlFilter: traffic.setUrlFilter,
    openFloatingTrafficWindow: async () => {
      await Promise.resolve()
    },
    refreshOverrides: refreshFloatingData,
    refreshBreakpoints: refreshFloatingData,
  })

  const openMainWindowForEntry = useCallback(async (id: string) => {
    try {
      await focusMainWindow(id)
    } catch (error) {
      window.alert(
        t.openMainFailed(error instanceof Error ? error.message : String(error)),
      )
    }
  }, [])

  return {
    wsStatus,
    urlFilter: traffic.urlFilter,
    setUrlFilter: traffic.setUrlFilter,
    clearTraffic: traffic.clearTraffic,
    filteredEntries: traffic.filteredEntries,
    selectedId: traffic.selectedId,
    setSelectedId: traffic.setSelectedId,
    selected,
    openMainWindowForEntry,
  }
}

export type FloatingTrafficState = ReturnType<typeof useFloatingTraffic>
