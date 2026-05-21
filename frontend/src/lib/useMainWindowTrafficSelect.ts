import { useEffect } from 'react'
import {
  TRAFFIC_SELECT_BROADCAST,
  TRAFFIC_SELECT_TAURI_EVENT,
} from './focusMainWindow'
import { isTauri } from './tauriEnv'

/** 主窗口监听浮窗发来的流量选中同步。 */
export function useMainWindowTrafficSelect(
  setSelectedId: (id: string) => void,
): void {
  useEffect(() => {
    if (isTauri()) {
      let unlisten: (() => void) | undefined
      void import('@tauri-apps/api/event').then(({ listen }) => {
        void listen<string>(TRAFFIC_SELECT_TAURI_EVENT, (event) => {
          if (typeof event.payload === 'string' && event.payload.length > 0) {
            setSelectedId(event.payload)
          }
        }).then((fn) => {
          unlisten = fn
        })
      })
      return () => unlisten?.()
    }

    const channel = new BroadcastChannel(TRAFFIC_SELECT_BROADCAST)
    channel.onmessage = (event: MessageEvent<{ requestId?: string }>) => {
      const id = event.data?.requestId
      if (typeof id === 'string' && id.length > 0) {
        setSelectedId(id)
      }
    }
    return () => channel.close()
  }, [setSelectedId])
}
