import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppWebSocket } from '../../dashboard/hooks/useAppWebSocket'
import { useTrafficState } from '../../traffic/hooks/useTrafficState'

export function useFloatingTraffic() {
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting',
  )
  const traffic = useTrafficState()
  const selectedIdRef = useRef<string | null>(null)

  useEffect(() => {
    selectedIdRef.current = traffic.selectedId
  }, [traffic.selectedId])

  const refreshFloatingData = useCallback(async () => {
    await Promise.resolve()
  }, [])

  useAppWebSocket({
    setEntries: traffic.setEntries,
    selectedIdRef,
    setSelectedId: traffic.setSelectedId,
    setWsStatus,
    refreshOverrides: refreshFloatingData,
    refreshBreakpoints: refreshFloatingData,
  })

  return {
    wsStatus,
    urlFilter: traffic.urlFilter,
    setUrlFilter: traffic.setUrlFilter,
    clearTraffic: traffic.clearTraffic,
    filteredEntries: traffic.filteredEntries,
    selectedId: traffic.selectedId,
    setSelectedId: traffic.setSelectedId,
  }
}

export type FloatingTrafficState = ReturnType<typeof useFloatingTraffic>
