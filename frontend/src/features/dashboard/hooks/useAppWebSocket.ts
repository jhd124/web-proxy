import type { MutableRefObject } from 'react'
import { useEffect } from 'react'
import { trimTrafficEntries } from '../../traffic/trafficEntriesLimit'
import { wsUrl } from '../../../lib/dashboardUtils'
import { focusMainWindow } from '../../../lib/focusMainWindow'
import type { TrafficEntry, WsMessage } from '../../../types'

type Ws = 'connecting' | 'open' | 'closed'

export function useAppWebSocket(p: {
  setEntries: React.Dispatch<React.SetStateAction<TrafficEntry[]>>
  /** Synced to current selected id every render; snapshot uses .current to avoid ws reconnects */
  selectedIdRef: MutableRefObject<string | null>
  setSelectedId: (id: string | null) => void
  setWsStatus: (s: Ws) => void
  setUrlFilter: (value: string) => void
  openFloatingTrafficWindow: () => Promise<void>
  refreshOverrides: () => Promise<void>
  refreshBreakpoints: () => Promise<void>
}) {
  const {
    setEntries,
    selectedIdRef,
    setSelectedId,
    setWsStatus,
    setUrlFilter,
    openFloatingTrafficWindow,
    refreshOverrides,
    refreshBreakpoints,
  } = p

  useEffect(() => {
    let ws: WebSocket | null = null
    let alive = true

    const syncFromServer = async () => {
      try {
        const r = await fetch('/api/requests')
        if (!r.ok) return
        const list = (await r.json()) as TrafficEntry[]
        setEntries(trimTrafficEntries(list))
      } catch {
        /* ignore */
      }
    }

    const connect = () => {
      if (!alive) return
      setWsStatus('connecting')
      ws = new WebSocket(wsUrl())
      ws.onopen = () => {
        setWsStatus('open')
        void syncFromServer()
      }
      ws.onclose = () => {
        setWsStatus('closed')
        if (alive) setTimeout(connect, 1500)
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WsMessage
          if (msg.type === 'snapshot') {
            setEntries(trimTrafficEntries(msg.requests))
            if (msg.requests.length && !selectedIdRef.current) {
              setSelectedId(msg.requests[msg.requests.length - 1]!.id)
            }
          } else if (msg.type === 'traffic') {
            setEntries((prev) => {
              const i = prev.findIndex((e) => e.id === msg.entry.id)
              if (i >= 0) {
                const next = [...prev]
                next[i] = msg.entry
                return next
              }
              return trimTrafficEntries([...prev, msg.entry])
            })
          } else if (msg.type === 'overrides_updated') {
            void refreshOverrides()
          } else if (msg.type === 'breakpoints_updated') {
            void refreshBreakpoints()
          } else if (msg.type === 'ui_action') {
            const action = msg.action
            if (action.action === 'focus_main_window') {
              void focusMainWindow()
            } else if (action.action === 'open_floating_traffic_window') {
              void openFloatingTrafficWindow()
            } else if (action.action === 'select_request') {
              setSelectedId(action.requestId)
            } else if (action.action === 'set_url_filter') {
              setUrlFilter(action.query)
            }
          }
        } catch {
          /* ignore */
        }
      }
    }

    connect()
    return () => {
      alive = false
      ws?.close()
    }
  }, [
    openFloatingTrafficWindow,
    refreshBreakpoints,
    refreshOverrides,
    selectedIdRef,
    setEntries,
    setSelectedId,
    setUrlFilter,
    setWsStatus,
  ])
}
