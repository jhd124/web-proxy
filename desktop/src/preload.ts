import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

type TrafficSelectCallback = (requestId: string) => void

contextBridge.exposeInMainWorld('proxyDesktop', {
  focusMainWindow: (requestId?: string | null) =>
    ipcRenderer.invoke('proxy:focus-main-window', requestId ?? null),
  openFloatingTrafficWindow: () =>
    ipcRenderer.invoke('proxy:open-floating-traffic-window'),
  openExternalUrl: (url: string) => ipcRenderer.invoke('proxy:open-external-url', url),
  installMitmCaSystemTrust: (caPemPath: string) =>
    ipcRenderer.invoke('proxy:install-mitm-ca-system-trust', caPemPath),
  openMitmCaFile: (caPemPath: string) =>
    ipcRenderer.invoke('proxy:open-mitm-ca-file', caPemPath),
  listCaptureBrowsers: () => ipcRenderer.invoke('proxy:list-capture-browsers'),
  launchCaptureBrowser: (args: {
    proxyPort: number
    caPemPath: string
    browserKey?: string
  }) => ipcRenderer.invoke('proxy:launch-capture-browser', args),
  onTrafficSelect: (callback: TrafficSelectCallback) => {
    if (typeof callback !== 'function') return () => {}

    const listener = (_event: IpcRendererEvent, requestId: unknown) => {
      if (typeof requestId === 'string' && requestId.length > 0) {
        callback(requestId)
      }
    }
    ipcRenderer.on('proxy:traffic-select', listener)
    return () => {
      ipcRenderer.removeListener('proxy:traffic-select', listener)
    }
  },
})
