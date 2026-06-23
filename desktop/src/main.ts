import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  type BrowserWindowConstructorOptions,
} from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'

const APP_NAME = 'Proxy'
const FLOATING_TRAFFIC_WINDOW_LABEL = 'floating-traffic'
const DEFAULT_VITE_PORT = 5173
const WAIT_POLLS = 600
const WAIT_INTERVAL_MS = 50
const TRAFFIC_SELECT_CHANNEL = 'proxy:traffic-select'

const desktopRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopRoot, '..')
const frontendRoot = path.join(repoRoot, 'frontend')
const preloadPath = path.join(__dirname, 'preload.js')

type ListenPorts = {
  proxyPort: number
  dashboardPort: number
}

type ProxyCommand = {
  command: string
  args: string[]
  cwd: string
}

let mainWindow: BrowserWindow | null = null
let floatingTrafficWindow: BrowserWindow | null = null
let proxyProcess: ChildProcess | null = null
let isQuitting = false

function readDevVitePort(): number {
  const raw = process.env.VITE_PORT || process.env.PORT
  const port = Number(raw)
  if (Number.isFinite(port) && port > 0 && port <= 65535) return port
  return DEFAULT_VITE_PORT
}

function getDevViteUrl(): string {
  if (process.env.VITE_DEV_URL) return process.env.VITE_DEV_URL
  return `http://127.0.0.1:${readDevVitePort()}`
}

function getProxyDataDir(): string {
  if (app.isPackaged) {
    return path.join(app.getPath('userData'), 'proxy-data')
  }
  return path.join(desktopRoot, '.data', 'dev')
}

function getListenPortsPath(dataDir: string): string {
  if (app.isPackaged) {
    return path.join(dataDir, 'listen-ports.json')
  }
  return path.join(frontendRoot, '.proxy-dev-ports.json')
}

function readListenPorts(filePath: string): ListenPorts | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      proxyPort?: unknown
      dashboardPort?: unknown
    }
    const proxyPort = Number(parsed.proxyPort)
    const dashboardPort = Number(parsed.dashboardPort)
    if (
      Number.isFinite(proxyPort) &&
      proxyPort > 0 &&
      proxyPort <= 65535 &&
      Number.isFinite(dashboardPort) &&
      dashboardPort > 0 &&
      dashboardPort <= 65535
    ) {
      return { proxyPort, dashboardPort }
    }
  } catch {
    return null
  }
  return null
}

function waitForTcp(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
    socket.setTimeout(500, () => {
      socket.destroy()
      resolve(false)
    })
  })
}

async function waitForDashboard(dataDir: string): Promise<ListenPorts> {
  const portsPath = getListenPortsPath(dataDir)
  for (let i = 0; i < WAIT_POLLS; i += 1) {
    const ports = readListenPorts(portsPath)
    if (ports && (await waitForTcp(ports.dashboardPort))) {
      return ports
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS))
  }
  throw new Error(`timed out waiting for dashboard port file: ${portsPath}`)
}

async function waitForVite(): Promise<string> {
  const viteUrl = new URL(getDevViteUrl())
  const port = Number(viteUrl.port || (viteUrl.protocol === 'https:' ? 443 : 80))
  for (let i = 0; i < WAIT_POLLS; i += 1) {
    if (await waitForTcp(port)) return viteUrl.toString()
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS))
  }
  throw new Error(`timed out waiting for Vite at ${viteUrl.toString()}`)
}

function getProxyCommand(): ProxyCommand {
  if (!app.isPackaged) {
    return {
      command: 'cargo',
      args: ['run', '-p', 'proxy-app'],
      cwd: repoRoot,
    }
  }

  const ext = process.platform === 'win32' ? '.exe' : ''
  return {
    command: path.join(process.resourcesPath, 'bin', `proxy-app${ext}`),
    args: [],
    cwd: process.resourcesPath,
  }
}

function startProxyApp(dataDir: string): void {
  if (proxyProcess && !proxyProcess.killed) return

  fs.mkdirSync(dataDir, { recursive: true })
  const portsPath = getListenPortsPath(dataDir)
  fs.rmSync(portsPath, { force: true })

  const proxy = getProxyCommand()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PROXY_DATA_DIR: dataDir,
    MITM: '1',
    PROXY_AUTO_SYSTEM_PROXY: '1',
  }

  if (app.isPackaged) {
    env.DASHBOARD_DIST = path.join(process.resourcesPath, 'dist')
  }

  proxyProcess = spawn(proxy.command, proxy.args, {
    cwd: proxy.cwd,
    detached: process.platform !== 'win32',
    env,
    stdio: app.isPackaged ? 'ignore' : 'inherit',
  })

  proxyProcess.on('exit', (code, signal) => {
    proxyProcess = null
    if (!isQuitting) {
      console.error(`proxy-app exited unexpectedly: code=${code} signal=${signal}`)
      app.quit()
    }
  })
  proxyProcess.on('error', (error) => {
    proxyProcess = null
    console.error('failed to start proxy-app:', error)
    app.quit()
  })
}

function stopProxyApp(): void {
  if (!proxyProcess || proxyProcess.killed) return

  const pid = proxyProcess.pid
  if (pid == null) {
    proxyProcess.kill('SIGTERM')
    return
  }

  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/t', '/f'], () => {})
    return
  }

  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    proxyProcess.kill('SIGTERM')
  }
}

function createBrowserWindow(
  options: BrowserWindowConstructorOptions = {},
): BrowserWindow {
  const window = new BrowserWindow({
    title: APP_NAME,
    width: 1200,
    height: 800,
    resizable: true,
    ...options,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      ...(options.webPreferences ?? {}),
    },
  })

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isFloatingTrafficUrl(url)) {
      openFloatingTrafficWindow(url)
      return { action: 'deny' }
    }
    if (isHttpUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  return window
}

function createMainWindow(): BrowserWindow {
  mainWindow = createBrowserWindow()
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  return mainWindow
}

function getFloatingUrl(): string {
  const sourceUrl = mainWindow?.webContents.getURL()
  const fallbackUrl = app.isPackaged ? 'http://127.0.0.1:9091' : getDevViteUrl()
  const url = new URL(sourceUrl || fallbackUrl)
  url.searchParams.set('view', FLOATING_TRAFFIC_WINDOW_LABEL)
  return url.toString()
}

function openFloatingTrafficWindow(targetUrl = getFloatingUrl()): void {
  if (floatingTrafficWindow && !floatingTrafficWindow.isDestroyed()) {
    floatingTrafficWindow.show()
    floatingTrafficWindow.focus()
    return
  }

  floatingTrafficWindow = createBrowserWindow({
    title: 'Proxy Traffic',
    width: 380,
    height: 560,
    minWidth: 300,
    minHeight: 360,
    alwaysOnTop: true,
    skipTaskbar: true,
  })
  floatingTrafficWindow.on('closed', () => {
    floatingTrafficWindow = null
  })
  void floatingTrafficWindow.loadURL(targetUrl)
}

function focusMainWindow(requestId: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  if (typeof requestId === 'string' && requestId.length > 0) {
    mainWindow.webContents.send(TRAFFIC_SELECT_CHANNEL, requestId)
  }
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isFloatingTrafficUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const parsed = new URL(value)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.searchParams.get('view') === FLOATING_TRAFFIC_WINDOW_LABEL
    )
  } catch {
    return false
  }
}

function validateMitmCaPath(caPemPath: unknown): string {
  if (typeof caPemPath !== 'string' || caPemPath.length === 0) {
    throw new Error('path is required')
  }
  if (!path.isAbsolute(caPemPath)) {
    throw new Error('path must be absolute')
  }
  if (path.basename(caPemPath) !== 'ca.pem') {
    throw new Error('expected a file named ca.pem')
  }
  if (path.basename(path.dirname(caPemPath)) !== 'mitm-ca-rsa') {
    throw new Error('expected .../mitm-ca-rsa/ca.pem')
  }
  if (!fs.existsSync(caPemPath) || !fs.statSync(caPemPath).isFile()) {
    throw new Error(
      'CA file not found (start proxy with MITM=1 and wait for the CA to be created)',
    )
  }
  return caPemPath
}

function installMitmCaSystemTrust(caPemPath: unknown): Promise<void> {
  const safePath = validateMitmCaPath(caPemPath)
  if (process.platform !== 'darwin') {
    throw new Error(
      'system trust install is only implemented on macOS. Use the download link and install manually, or add support for this OS.',
    )
  }

  const script = [
    'on run argv',
    'set p to item 1 of argv',
    'do shell script "security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain " & quoted form of p with administrator privileges',
    'end run',
  ].join('\n')

  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script, '--', safePath], (error, stdout, stderr) => {
      if (!error) {
        resolve()
        return
      }
      reject(new Error(`install failed (user cancelled or not allowed):\n${stderr}${stdout}`))
    })
  })
}

async function openMitmCaFile(caPemPath: unknown): Promise<void> {
  const safePath = validateMitmCaPath(caPemPath)
  const errorMessage = await shell.openPath(safePath)
  if (errorMessage) throw new Error(errorMessage)
}

function registerIpcHandlers(): void {
  ipcMain.handle('proxy:focus-main-window', (_event, requestId: unknown) => {
    focusMainWindow(requestId)
  })
  ipcMain.handle('proxy:open-floating-traffic-window', () => {
    openFloatingTrafficWindow()
  })
  ipcMain.handle('proxy:open-external-url', async (_event, url: unknown) => {
    if (!isHttpUrl(url)) {
      throw new Error('only http(s) URLs can be opened')
    }
    await shell.openExternal(url)
  })
  ipcMain.handle('proxy:install-mitm-ca-system-trust', (_event, caPemPath: unknown) =>
    installMitmCaSystemTrust(caPemPath),
  )
  ipcMain.handle('proxy:open-mitm-ca-file', (_event, caPemPath: unknown) =>
    openMitmCaFile(caPemPath),
  )
}

async function boot(): Promise<void> {
  const dataDir = getProxyDataDir()
  startProxyApp(dataDir)
  const main = createMainWindow()

  const ports = await waitForDashboard(dataDir)
  if (app.isPackaged) {
    await main.loadURL(`http://127.0.0.1:${ports.dashboardPort}`)
    return
  }

  const viteUrl = await waitForVite()
  await main.loadURL(viteUrl)
}

app.setName(APP_NAME)
registerIpcHandlers()

app.whenReady().then(() => {
  void boot().catch((error: unknown) => {
    console.error(error)
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void boot().catch((error: unknown) => {
        console.error(error)
        app.quit()
      })
    }
  })
})

app.on('before-quit', () => {
  isQuitting = true
  stopProxyApp()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
