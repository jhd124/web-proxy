import { useEffect } from 'react'
import { getDesktopHost } from './desktopHost'
import { TRAFFIC_SELECT_BROADCAST } from './focusMainWindow'

/** 主窗口监听浮窗发来的流量选中同步。 */
export function useMainWindowTrafficSelect(
  setSelectedId: (id: string) => void,
): void {
  useEffect(() => {
    const desktopHost = getDesktopHost()
    if (desktopHost) {
      return desktopHost.onTrafficSelect(setSelectedId)
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
