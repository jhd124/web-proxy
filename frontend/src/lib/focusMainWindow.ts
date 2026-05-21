import { isTauri } from './tauriEnv'

export const TRAFFIC_SELECT_BROADCAST = 'proxy-traffic-select'
export const TRAFFIC_SELECT_TAURI_EVENT = 'traffic-select'

/** 将主窗口置于前台，并可选同步选中流量条目。 */
export async function focusMainWindow(requestId?: string | null): Promise<void> {
  const id = requestId ?? undefined

  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('focus_main_window', { requestId: id ?? null })
    return
  }

  if (id) {
    const channel = new BroadcastChannel(TRAFFIC_SELECT_BROADCAST)
    channel.postMessage({ requestId: id })
    channel.close()
  }
  window.opener?.focus()
}
