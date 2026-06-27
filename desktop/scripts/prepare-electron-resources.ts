/**
 * Prepare production resources for electron-builder:
 * - React dashboard bundle -> desktop/resources/dist
 * - Rust sidecar binary -> desktop/resources/bin/proxy-app(.exe)
 * - MCP server sources -> desktop/resources/mcp
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(scriptDir, '..', '..')
const desktopRoot = path.join(root, 'desktop')
const ext = process.platform === 'win32' ? '.exe' : ''
const frontendDist = path.join(root, 'frontend', 'dist')
const proxyBinary = path.join(root, 'target', 'release', `proxy-app${ext}`)
const mcpRoot = path.join(root, 'mcp')
const resourcesDir = path.join(desktopRoot, 'resources')
const distDest = path.join(resourcesDir, 'dist')
const binDestDir = path.join(resourcesDir, 'bin')
const binDest = path.join(binDestDir, `proxy-app${ext}`)
const mcpDest = path.join(resourcesDir, 'mcp')

if (!fs.existsSync(frontendDist)) {
  console.error(`Missing ${frontendDist}; run: cd frontend && bun run build`)
  process.exit(1)
}

if (!fs.existsSync(proxyBinary)) {
  console.error(`Missing ${proxyBinary}; run: cargo build --release -p proxy-app`)
  process.exit(1)
}

if (!fs.existsSync(path.join(mcpRoot, 'proxy-mcp-server.mjs'))) {
  console.error(`Missing MCP server entry: ${path.join(mcpRoot, 'proxy-mcp-server.mjs')}`)
  process.exit(1)
}

fs.rmSync(resourcesDir, { recursive: true, force: true })
fs.mkdirSync(binDestDir, { recursive: true })
fs.cpSync(frontendDist, distDest, { recursive: true })
fs.copyFileSync(proxyBinary, binDest)
fs.cpSync(mcpRoot, mcpDest, { recursive: true })

if (process.platform !== 'win32') {
  fs.chmodSync(binDest, 0o755)
}

console.log('prepared Electron resources:', resourcesDir)
