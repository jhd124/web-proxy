import { focusMainWindow } from '@/lib/focusMainWindow'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAdvancedSearchContext } from '../../advanced-search/advancedSearchContext'
import { useAppWebSocket } from '../../dashboard/hooks/useAppWebSocket'
import { useTrafficState } from '../../traffic/hooks/useTrafficState'
import { floatingTrafficTexts as t } from '../texts'

export function useFloatingTraffic() {
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting',
  )
  const traffic = useTrafficState()
  const { registerOpenHandler: registerAdvancedSearchOpenHandler } =
    useAdvancedSearchContext()
  const selectedIdRef = useRef<string | null>(null)

  useEffect(() => {
    selectedIdRef.current = traffic.selectedId
  }, [traffic.selectedId])

  const refreshFloatingData = useCallback(async () => {
    await Promise.resolve()
  }, [])
  const openFloatingTrafficWindow = useCallback(async () => {
    await Promise.resolve()
  }, [])

  useAppWebSocket({
    setEntries: traffic.setEntries,
    selectedIdRef,
    setSelectedId: traffic.setSelectedId,
    setWsStatus,
    setUrlFilterFromQuery: traffic.setUrlFilterFromQuery,
    openFloatingTrafficWindow,
    refreshOverrides: refreshFloatingData,
    refreshBreakpoints: refreshFloatingData,
  })

  const openMainWindowForEntry = useCallback(async (id?: string | null) => {
    try {
      await focusMainWindow(id)
    } catch (error) {
      window.alert(
        t.openMainFailed(error instanceof Error ? error.message : String(error)),
      )
    }
  }, [])

  useEffect(() => {
    return registerAdvancedSearchOpenHandler((target) => {
      if (target.entityType === 'traffic' || target.entityType === 'saved') {
        void openMainWindowForEntry(target.id)
        return
      }
      void openMainWindowForEntry()
    })
  }, [openMainWindowForEntry, registerAdvancedSearchOpenHandler])

  return {
    wsStatus,
    urlFilter: traffic.urlFilter,
    setUrlFilter: traffic.setUrlFilter,
    urlFilterTags: traffic.urlFilterTags,
    activeFilterKeywords: traffic.activeFilterKeywords,
    commitUrlFilterInputAsTag: traffic.commitUrlFilterInputAsTag,
    removeUrlFilterTag: traffic.removeUrlFilterTag,
    popUrlFilterTag: traffic.popUrlFilterTag,
    clearTraffic: traffic.clearTraffic,
    filteredEntries: traffic.filteredEntries,
    highlightedEntryIds: traffic.highlightedEntryIds,
    selectedId: traffic.selectedId,
    setSelectedId: traffic.setSelectedId,
    selected: traffic.selected,
    toggleEntryHighlight: traffic.toggleEntryHighlight,
    openMainWindowForEntry,
  }
}

export type FloatingTrafficState = ReturnType<typeof useFloatingTraffic>
