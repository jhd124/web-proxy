import { getDesktopHost } from './desktopHost'

export const TRAFFIC_SELECT_BROADCAST = 'proxy-traffic-select'

/** 将主窗口置于前台，并可选同步选中流量条目。 */
export async function focusMainWindow(requestId?: string | null): Promise<void> {
  const id = requestId ?? undefined
  const desktopHost = getDesktopHost()

  if (desktopHost) {
    await desktopHost.focusMainWindow(id ?? null)
    return
  }

  if (id) {
    const channel = new BroadcastChannel(TRAFFIC_SELECT_BROADCAST)
    channel.postMessage({ requestId: id })
    channel.close()
  }
  window.opener?.focus()
}
