import type { MutableRefObject } from 'react'
import { useEffect } from 'react'
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
  setUrlFilterFromQuery: (value: string) => void
  onProxyListenAddressChange?: (value: string | null) => void
  openFloatingTrafficWindow: () => Promise<void>
  refreshOverrides: () => Promise<void>
  refreshBreakpoints: () => Promise<void>
}) {
  const {
    setEntries,
    selectedIdRef,
    setSelectedId,
    setWsStatus,
    setUrlFilterFromQuery,
    onProxyListenAddressChange,
    openFloatingTrafficWindow,
    refreshOverrides,
    refreshBreakpoints,
  } = p

  useEffect(() => {
    let ws: WebSocket | null = null
    let alive = true

    // 高频 traffic 消息先按 id 合并到缓冲区，再用 rAF 每帧统一 flush，
    // 把每秒几十次 setEntries 合并到约每帧一次，避免重渲染风暴。
    const pendingTrafficById = new Map<string, TrafficEntry>()
    let flushHandle: number | null = null
    const hasRaf = typeof requestAnimationFrame === 'function'

    const flushPendingTraffic = () => {
      flushHandle = null
      if (pendingTrafficById.size === 0) return
      const batchedEntries = Array.from(pendingTrafficById.values())
      pendingTrafficById.clear()
      setEntries((prev) => {
        const indexById = new Map<string, number>()
        for (let i = 0; i < prev.length; i += 1) {
          indexById.set(prev[i]!.id, i)
        }
        let updatedEntries: TrafficEntry[] | null = null
        const appendedEntries: TrafficEntry[] = []
        for (const entry of batchedEntries) {
          const existingIndex = indexById.get(entry.id)
          if (existingIndex === undefined) {
            appendedEntries.push(entry)
            continue
          }
          if (!updatedEntries) updatedEntries = prev.slice()
          updatedEntries[existingIndex] = entry
        }
        if (!updatedEntries && appendedEntries.length === 0) return prev
        const baseEntries = updatedEntries ?? prev
        return appendedEntries.length > 0
          ? baseEntries.concat(appendedEntries)
          : baseEntries
      })
    }

    const scheduleFlush = () => {
      if (flushHandle !== null) return
      flushHandle = hasRaf
        ? requestAnimationFrame(flushPendingTraffic)
        : (setTimeout(flushPendingTraffic, 16) as unknown as number)
    }

    const cancelScheduledFlush = () => {
      if (flushHandle === null) return
      if (hasRaf) {
        cancelAnimationFrame(flushHandle)
      } else {
        clearTimeout(flushHandle)
      }
      flushHandle = null
    }

    const syncFromServer = async () => {
      try {
        const r = await fetch('/api/requests')
        if (!r.ok) return
        const list = (await r.json()) as TrafficEntry[]
        cancelScheduledFlush()
        pendingTrafficById.clear()
        setEntries(list)
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
            // snapshot 全量替换，丢弃尚未 flush 的增量缓冲，避免旧增量覆盖新快照。
            cancelScheduledFlush()
            pendingTrafficById.clear()
            setEntries(msg.requests)
            if (msg.requests.length && !selectedIdRef.current) {
              setSelectedId(msg.requests[msg.requests.length - 1]!.id)
            }
          } else if (msg.type === 'traffic') {
            pendingTrafficById.set(msg.entry.id, msg.entry)
            scheduleFlush()
          } else if (msg.type === 'overrides_updated') {
            void refreshOverrides()
          } else if (msg.type === 'breakpoints_updated') {
            void refreshBreakpoints()
          } else if (msg.type === 'proxy_listen_updated') {
            const legacyPayload = msg as {
              proxy_listen_ipv4?: string | null
              proxy_port?: number | null
            }
            const proxyListenIpv4Legacy =
              typeof legacyPayload.proxy_listen_ipv4 === 'string'
                ? legacyPayload.proxy_listen_ipv4
                : null
            const proxyPortLegacy =
              typeof legacyPayload.proxy_port === 'number'
                ? legacyPayload.proxy_port
                : null
            const ipv4 =
              typeof msg.proxyListenIpv4 === 'string' &&
              /^\d{1,3}(\.\d{1,3}){3}$/.test(msg.proxyListenIpv4)
                ? msg.proxyListenIpv4
                : typeof proxyListenIpv4Legacy === 'string' &&
                    /^\d{1,3}(\.\d{1,3}){3}$/.test(proxyListenIpv4Legacy)
                  ? proxyListenIpv4Legacy
                : null
            const port =
              typeof msg.proxyPort === 'number' &&
              Number.isFinite(msg.proxyPort) &&
              msg.proxyPort > 0 &&
              msg.proxyPort <= 65535
                ? msg.proxyPort
                : typeof proxyPortLegacy === 'number' &&
                    Number.isFinite(proxyPortLegacy) &&
                    proxyPortLegacy > 0 &&
                    proxyPortLegacy <= 65535
                  ? proxyPortLegacy
                : null
            const nextProxyListenAddress =
              ipv4 != null && port != null ? `${ipv4}:${port}` : null
            onProxyListenAddressChange?.(nextProxyListenAddress)
          } else if (msg.type === 'ui_action') {
            const action = msg.action
            if (action.action === 'focus_main_window') {
              void focusMainWindow()
            } else if (action.action === 'open_floating_traffic_window') {
              void openFloatingTrafficWindow()
            } else if (action.action === 'select_request') {
              setSelectedId(action.requestId)
            } else if (action.action === 'set_url_filter') {
              setUrlFilterFromQuery(action.query)
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
      cancelScheduledFlush()
      pendingTrafficById.clear()
      ws?.close()
    }
  }, [
    openFloatingTrafficWindow,
    refreshBreakpoints,
    refreshOverrides,
    selectedIdRef,
    setEntries,
    setSelectedId,
    setUrlFilterFromQuery,
    setWsStatus,
    onProxyListenAddressChange,
  ])
}
