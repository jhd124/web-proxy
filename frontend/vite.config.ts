import fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const __dirname = dirname(fileURLToPath(import.meta.url))

function readDevDashboardPort(): number {
  const fromEnv = process.env.DASHBOARD_PORT
  if (fromEnv !== undefined && fromEnv !== '') {
    const n = Number(fromEnv)
    if (Number.isFinite(n) && n > 0 && n <= 65535) return n
  }
  const filePath = resolve(__dirname, '.proxy-dev-ports.json')
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const j = JSON.parse(raw) as { dashboardPort?: number }
    const n = Number(j.dashboardPort)
    if (Number.isFinite(n) && n > 0 && n <= 65535) return n
  } catch {
    /* missing or invalid */
  }
  return 9091
}

const dashboardPort = readDevDashboardPort()
const dashboardOrigin = `http://127.0.0.1:${dashboardPort}`
const dashboardWs = `ws://127.0.0.1:${dashboardPort}`

const viteDevPort = Number(process.env.VITE_PORT ?? process.env.PORT) || 5173

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  define: {
    'import.meta.env.VITE_DASHBOARD_PORT': JSON.stringify(String(dashboardPort)),
  },
  server: {
    // 与 Electron 开发主窗口默认 URL 一致；避免仅监听 ::1 时桌面壳探测失败。
    host: '127.0.0.1',
    port: viteDevPort,
    // 禁止静默换端口，否则桌面壳仍等 5173 直至超时。
    strictPort: true,
    proxy: {
      '/api': { target: dashboardOrigin, changeOrigin: true },
      '/ws': { target: dashboardWs, ws: true },
    },
  },
})
