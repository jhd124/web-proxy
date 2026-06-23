# Desktop（Electron）架构介绍（Agent 参考）

本文档描述 `desktop/`（Electron）模块的架构与实现细节，供 Agent 在桌面能力改动时参考。

## 1. 技术栈与定位

- 桌面框架：Electron（main process + preload + Chromium renderer）。
- 前端加载：
  - 开发态：主窗口加载 Vite Dev Server（HMR）；
  - 发布态：加载 sidecar `proxy-app` 提供的 dashboard 页面。
- 核心目标：
  1. 托管主窗口与浮动流量窗口；
  2. 启动/管理后端 sidecar；
  3. 通过安全 preload IPC 提供系统级能力（MITM 证书安装、外部链接、窗口管理）。

## 2. 目录与核心文件

- `desktop/src/main.ts`：Electron 主进程源码，负责窗口创建、sidecar 生命周期、IPC handler、证书与外部链接能力。
- `desktop/src/preload.ts`：通过 `contextBridge` 暴露 `window.proxyDesktop`，renderer 不直接访问 Node/Electron API。
- `desktop/src/icons/`：桌面应用图标，供 electron-builder 复用。
- `desktop/scripts/prepare-electron-resources.ts`：复制 `frontend/dist` 与 release `proxy-app` 到 `desktop/resources/`。
- `desktop/tsconfig.json`：将 `src/*.ts` 编译到 `dist-electron/`，供 Electron 运行与打包使用。
- `desktop/package.json`：Bun 驱动的 Electron 运行脚本与 electron-builder 打包配置。

## 3. 运行模式

### 3.1 开发模式

- `bun run electron:dev` 使用 `concurrently` 同时拉起：
  - `frontend` 的 Vite dev server；
  - Electron 主进程。
- Electron 主进程启动 `cargo run -p proxy-app`，注入：
  - `PROXY_DATA_DIR=desktop/.data/dev`；
  - `MITM=1`；
  - `PROXY_AUTO_SYSTEM_PROXY=1`。
- Electron 等待 `frontend/.proxy-dev-ports.json` 与 Vite 默认端口可用后加载 `VITE_DEV_URL`（默认 `http://127.0.0.1:5173`）。

### 3.2 发布模式

- 通过 `electron:prebuild` 先构建：
  - `frontend/dist`；
  - `proxy-app --release`；
  - 并复制资源到 `desktop/resources/`。
- electron-builder 使用 `extraResources` 携带：
  - `resources/dist` -> 应用资源目录 `dist`；
  - `resources/bin` -> 应用资源目录 `bin`。
- Electron 启动时 spawn sidecar `proxy-app`，注入：
  - `DASHBOARD_DIST`（静态资源目录）；
  - `PROXY_DATA_DIR`（应用数据目录）；
  - `MITM=1`。
- 读取 `listen-ports.json` 等待 dashboard 就绪后再导航主窗口。

## 4. Electron IPC（前端可调用）

`preload.ts` 暴露 `window.proxyDesktop`，当前方法：

- `focusMainWindow(requestId?)`
  - 激活主窗口；
  - 可附带请求 ID，让前端选中对应流量。
- `openFloatingTrafficWindow()`
  - 打开或聚焦浮动流量窗口；
  - URL 基于主窗口并附加 `?view=floating-traffic`。
- `window.open('/?view=floating-traffic')`
  - 主进程会拦截该内部 URL 并创建 Electron 浮窗，避免 fallback 跑到系统浏览器。
- `openExternalUrl(url)`
  - 校验 `http/https` URL 后调用系统浏览器。
- `installMitmCaSystemTrust(caPemPath)`
  - 安装 MITM 根证书到系统信任（当前重点支持 macOS）。
- `openMitmCaFile(caPemPath)`
  - 打开证书文件，辅助用户手动安装。
- `onTrafficSelect(callback)`
  - 主窗口监听浮窗请求选中同步。

## 5. 系统代理

系统 HTTP/HTTPS 代理能力位于后端 `backend/src/system_proxy/`，由 Dashboard API 调用。Electron 只负责 sidecar 生命周期并传入 `PROXY_AUTO_SYSTEM_PROXY=1`：

1. 启动时保存当前网络服务的 HTTP/HTTPS 代理配置；
2. 切换为本机代理；
3. 后端收到退出信号时恢复原配置。

macOS 实现细节（`network/macos.rs`）：

- 自动识别默认路由对应网络服务（必要时回退到第一个启用服务）；
- 通过 `networksetup` 读写 `-setwebproxy/-setsecurewebproxy`；
- 失败时回滚原配置。

## 6. MITM 证书安装实现

`desktop/src/main.ts` 的关键策略：

- 严格校验路径必须是绝对路径且指向 `.../mitm-ca-rsa/ca.pem`；
- macOS 使用 `osascript + security add-trusted-cert` 触发管理员授权；
- 提供 `shell.openPath` 文件能力做手动安装兜底。

## 7. 资源与 sidecar 打包约束

`desktop/package.json` 的 electron-builder 配置中：

- `files` 仅包含 Electron main/preload 与 package 元数据；
- `extraResources` 携带 dashboard 静态资源与 `proxy-app` sidecar；
- macOS 使用 `dmg/zip`，Windows 使用 `nsis/portable`，Linux 使用 `AppImage/deb`。

`prepare-electron-resources.ts` 会按当前宿主平台复制 `target/release/proxy-app(.exe)` 到 `desktop/resources/bin/`，并复制 `frontend/dist` 到 `desktop/resources/dist/`。

## 8. Agent 改动注意事项

1. 新增桌面命令时，需同步：
   - `ipcMain.handle` 注册；
   - `preload.ts` 中的 `contextBridge` 方法；
   - 前端调用（通常在 `desktopHost` 分支内）。
2. 所有系统级改动要考虑退出恢复路径，避免“改了系统配置但未恢复”。
3. sidecar 启动流程改动需兼顾 dev/release 双模式，避免仅在一种模式可用。
4. 涉及路径或命令执行时，优先做输入校验与失败回滚。
