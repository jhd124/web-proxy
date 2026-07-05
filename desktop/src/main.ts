import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  type BrowserWindowConstructorOptions,
} from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { X509Certificate, createHash } from 'node:crypto'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

const APP_NAME = 'LeoProxy'
const FLOATING_TRAFFIC_WINDOW_LABEL = 'floating-traffic'
const DEFAULT_VITE_PORT = 5173
const DEFAULT_MCP_HTTP_PORT = 19091
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
let mcpServerProcess: ChildProcess | null = null
let mcpDashboardUrl: string | null = null
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

function formatMainWindowTitle(proxyListenAddress: unknown): string {
  if (proxyListenAddress == null) return APP_NAME
  return String(proxyListenAddress)
}

function setMainWindowTitle(proxyListenAddress: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setTitle(formatMainWindowTitle(proxyListenAddress))
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

function getMcpScriptPath(): string {
  if (!app.isPackaged) {
    return path.join(repoRoot, 'mcp', 'proxy-mcp-server.mjs')
  }
  return path.join(process.resourcesPath, 'mcp', 'proxy-mcp-server.mjs')
}

function getMcpCommand(): ProxyCommand {
  return {
    command: process.execPath,
    args: [getMcpScriptPath()],
    cwd: app.isPackaged ? process.resourcesPath : repoRoot,
  }
}

function resolveMcpHttpPort(): number {
  const raw = Number(process.env.PROXY_MCP_HTTP_PORT)
  if (Number.isFinite(raw) && raw > 0 && raw <= 65535) {
    return raw
  }
  return DEFAULT_MCP_HTTP_PORT
}

function stopChildProcess(child: ChildProcess | null): void {
  if (!child || child.killed) return

  const pid = child.pid
  if (pid == null) {
    child.kill('SIGTERM')
    return
  }

  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(pid), '/t', '/f'], () => {})
    return
  }

  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    child.kill('SIGTERM')
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
  stopChildProcess(proxyProcess)
}

function startMcpServer(dashboardPort: number): void {
  const nextDashboardUrl = `http://127.0.0.1:${dashboardPort}`
  const mcpHttpPort = resolveMcpHttpPort()
  if (
    mcpServerProcess &&
    !mcpServerProcess.killed &&
    mcpDashboardUrl === nextDashboardUrl
  ) {
    return
  }

  if (mcpServerProcess && !mcpServerProcess.killed) {
    stopChildProcess(mcpServerProcess)
    mcpServerProcess = null
  }

  const mcp = getMcpCommand()
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
    PROXY_MCP_TRANSPORT: 'http',
    PROXY_MCP_HTTP_PORT: String(mcpHttpPort),
    PROXY_MCP_HTTP_HOST: '127.0.0.1',
    PROXY_DASHBOARD_URL: nextDashboardUrl,
  }

  mcpServerProcess = spawn(mcp.command, mcp.args, {
    cwd: mcp.cwd,
    detached: process.platform !== 'win32',
    env,
    stdio: app.isPackaged ? 'ignore' : 'inherit',
  })
  mcpDashboardUrl = nextDashboardUrl

  mcpServerProcess.on('exit', (code, signal) => {
    mcpServerProcess = null
    if (!isQuitting) {
      console.error(`mcp server exited unexpectedly: code=${code} signal=${signal}`)
    }
  })
  mcpServerProcess.on('error', (error) => {
    mcpServerProcess = null
    console.error('failed to start mcp server:', error)
  })
}

function stopMcpServer(): void {
  stopChildProcess(mcpServerProcess)
  mcpServerProcess = null
  mcpDashboardUrl = null
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
  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault()
  })
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
    title: 'LeoProxy Traffic',
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

const CAPTURE_BROWSER_PROFILE_DIRNAME = 'capture-browser'

type CaptureBrowser = { name: string; execPath: string; profileKey: string }

/** Chromium 内核浏览器候选；`appRelExec` 是相对 Applications 目录的可执行文件路径。 */
const MAC_CHROMIUM_BROWSER_DEFS: ReadonlyArray<{
  name: string
  profileKey: string
  appRelExec: string
}> = [
  { name: 'Google Chrome', profileKey: 'chrome', appRelExec: 'Google Chrome.app/Contents/MacOS/Google Chrome' },
  { name: 'Google Chrome Beta', profileKey: 'chrome-beta', appRelExec: 'Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta' },
  { name: 'Google Chrome Dev', profileKey: 'chrome-dev', appRelExec: 'Google Chrome Dev.app/Contents/MacOS/Google Chrome Dev' },
  { name: 'Google Chrome Canary', profileKey: 'chrome-canary', appRelExec: 'Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary' },
  { name: 'Microsoft Edge', profileKey: 'edge', appRelExec: 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge' },
  { name: 'Brave Browser', profileKey: 'brave', appRelExec: 'Brave Browser.app/Contents/MacOS/Brave Browser' },
  { name: 'Vivaldi', profileKey: 'vivaldi', appRelExec: 'Vivaldi.app/Contents/MacOS/Vivaldi' },
  { name: 'Opera', profileKey: 'opera', appRelExec: 'Opera.app/Contents/MacOS/Opera' },
  { name: 'Arc', profileKey: 'arc', appRelExec: 'Arc.app/Contents/MacOS/Arc' },
  { name: 'Chromium', profileKey: 'chromium', appRelExec: 'Chromium.app/Contents/MacOS/Chromium' },
]

/** 扫描本机已安装的 Chromium 内核浏览器（/Applications 与 ~/Applications）。 */
function listInstalledCaptureBrowsers(): CaptureBrowser[] {
  if (process.platform !== 'darwin') return []
  const roots = ['/Applications', path.join(os.homedir(), 'Applications')]
  const found: CaptureBrowser[] = []
  for (const def of MAC_CHROMIUM_BROWSER_DEFS) {
    for (const root of roots) {
      const execPath = path.join(root, def.appRelExec)
      if (fs.existsSync(execPath)) {
        found.push({ name: def.name, profileKey: def.profileKey, execPath })
        break
      }
    }
  }
  return found
}

/** Chrome `--ignore-certificate-errors-spki-list` 需要 base64(sha256(DER SPKI))。 */
function computeCaSpkiSha256(caPemPath: string): string {
  const cert = new X509Certificate(fs.readFileSync(caPemPath))
  const spkiDer = cert.publicKey.export({ type: 'spki', format: 'der' })
  return createHash('sha256').update(spkiDer).digest('base64')
}

function launchCaptureBrowser(rawArgs: unknown): { browserName: string } {
  const args = (rawArgs ?? {}) as {
    proxyPort?: unknown
    caPemPath?: unknown
    browserKey?: unknown
  }
  const proxyPort = Number(args.proxyPort)
  if (!Number.isInteger(proxyPort) || proxyPort <= 0 || proxyPort > 65535) {
    throw new Error('valid proxyPort is required')
  }
  const safeCaPath = validateMitmCaPath(args.caPemPath)
  const installed = listInstalledCaptureBrowsers()
  if (installed.length === 0) {
    throw new Error(
      'no Chromium-based browser found (install Google Chrome to capture localhost)',
    )
  }
  // 仅允许从扫描结果中按 key 选择，避免 renderer 传入任意可执行路径。
  const browser =
    typeof args.browserKey === 'string'
      ? installed.find((b) => b.profileKey === args.browserKey)
      : installed[0]
  if (!browser) {
    throw new Error('requested browser is not installed')
  }
  const spkiSha256 = computeCaSpkiSha256(safeCaPath)
  // 独立 profile：避免污染日常浏览器，并确保命令行代理参数不会被已运行实例忽略。
  const profileDir = path.join(
    getProxyDataDir(),
    CAPTURE_BROWSER_PROFILE_DIRNAME,
    browser.profileKey,
  )
  fs.mkdirSync(profileDir, { recursive: true })
  const launchArgs = [
    `--proxy-server=127.0.0.1:${proxyPort}`,
    // 关键：减去 Chromium 硬编码的 localhost/loopback 隐式 bypass，否则本机请求不走代理。
    '--proxy-bypass-list=<-loopback>',
    // 仅信任本应用的 MITM CA，无需安装到系统钥匙串。
    `--ignore-certificate-errors-spki-list=${spkiSha256}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
  ]
  const child = spawn(browser.execPath, launchArgs, {
    detached: true,
    stdio: 'ignore',
  })
  child.unref()
  return { browserName: browser.name }
}

function registerIpcHandlers(): void {
  ipcMain.handle('proxy:focus-main-window', (_event, requestId: unknown) => {
    focusMainWindow(requestId)
  })
  ipcMain.handle('proxy:open-floating-traffic-window', () => {
    openFloatingTrafficWindow()
  })
  ipcMain.handle('proxy:update-proxy-listen-address', (_event, proxyListenAddress: unknown) => {
    setMainWindowTitle(proxyListenAddress)
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
  ipcMain.handle('proxy:list-capture-browsers', () =>
    listInstalledCaptureBrowsers().map((b) => ({ name: b.name, key: b.profileKey })),
  )
  ipcMain.handle('proxy:launch-capture-browser', (_event, args: unknown) =>
    launchCaptureBrowser(args),
  )
}

async function boot(): Promise<void> {
  const dataDir = getProxyDataDir()
  startProxyApp(dataDir)
  const main = createMainWindow()

  const ports = await waitForDashboard(dataDir)
  startMcpServer(ports.dashboardPort)
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
  stopMcpServer()
  stopProxyApp()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
