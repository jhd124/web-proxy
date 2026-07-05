export type DesktopTrafficSelectUnsubscribe = () => void

export type DesktopHostApi = {
  focusMainWindow: (requestId?: string | null) => Promise<void>
  openFloatingTrafficWindow: () => Promise<void>
  updateProxyListenAddress: (proxyListenAddress: string | null) => Promise<void>
  openExternalUrl: (url: string) => Promise<void>
  installMitmCaSystemTrust: (caPemPath: string) => Promise<void>
  openMitmCaFile: (caPemPath: string) => Promise<void>
  listCaptureBrowsers: () => Promise<Array<{ name: string; key: string }>>
  launchCaptureBrowser: (args: {
    proxyPort: number
    caPemPath: string
    browserKey?: string
  }) => Promise<{ browserName: string }>
  onTrafficSelect: (
    callback: (requestId: string) => void,
  ) => DesktopTrafficSelectUnsubscribe
}

declare global {
  interface Window {
    proxyDesktop?: DesktopHostApi
  }
}

/** True when the UI runs inside the Electron desktop host. */
export function isDesktopHost(): boolean {
  return typeof window !== 'undefined' && window.proxyDesktop != null
}

export function getDesktopHost(): DesktopHostApi | null {
  if (!isDesktopHost()) return null
  return window.proxyDesktop ?? null
}
