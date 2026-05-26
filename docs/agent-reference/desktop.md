# Desktop（Tauri）架构介绍（Agent 参考）

本文档描述 `desktop/`（Tauri 2）模块的架构与实现细节，供 Agent 在桌面能力改动时参考。

## 1. 技术栈与定位

- 桌面框架：Tauri 2（Rust + WebView）。
- 前端加载：
  - 开发态：优先切到 Vite Dev Server（HMR）；
  - 发布态：加载 sidecar `proxy-app` 提供的 dashboard 页面。
- 核心目标：
  1. 托管主窗口与浮动流量窗口；
  2. 启动/管理后端 sidecar；
  3. 提供系统级能力（MITM 证书安装、系统代理设置）。

## 2. 目录与核心文件

- `desktop/src/src/lib.rs`：Tauri 主逻辑、命令注册、sidecar 生命周期。
- `desktop/src/src/main.rs`：入口，仅调用 `app_lib::run()`。
- `desktop/src/src/mitm_install.rs`：MITM CA 安装与打开文件。
- `desktop/src/src/system_proxy/*`：系统 HTTP/HTTPS 代理管理。
- `desktop/src/tauri.conf.json`：窗口、构建、资源与 sidecar 配置。
- `desktop/scripts/prepare-tauri-sidecar.cjs`：复制后端可执行文件到 Tauri 期望路径。

## 3. 运行模式

### 3.1 开发模式

- `beforeDevCommand` 执行 `npm run dev:tauri-stack`，同时拉起：
  - `cargo run -p proxy-app`；
  - `frontend` 的 Vite dev server。
- Tauri 启动后会等待 Vite 可用，再将主窗口导航到 `VITE_DEV_URL`。
- 端口文件来源：`frontend/.proxy-dev-ports.json`。

### 3.2 发布模式

- 通过 `tauri:prebuild` 先构建：
  - `frontend/dist`；
  - `proxy-app --release`；
  - 并复制 sidecar 到 `desktop/src/binaries/`。
- Tauri 启动时 spawn sidecar `proxy-app`，注入：
  - `DASHBOARD_DIST`（静态资源目录）；
  - `PROXY_DATA_DIR`（应用数据目录）；
  - `MITM=1`。
- 读取 `listen-ports.json` 等待 dashboard 就绪后再导航主窗口。

## 4. Tauri 命令（前端可调用）

`lib.rs` 当前注册命令：

- `focus_main_window(request_id?)`
  - 激活主窗口；
  - 可附带请求 ID，让前端选中对应流量。
- `open_floating_traffic_window()`
  - 打开或聚焦浮动流量窗口；
  - URL 基于主窗口并附加 `?view=floating-traffic`。
- `enable_system_http_https_proxy(proxy_port)`
  - 开启系统 HTTP/HTTPS 代理指向 `127.0.0.1:<proxy_port>`。
- `install_mitm_ca_system_trust(ca_pem_path)`
  - 安装 MITM 根证书到系统信任（当前重点支持 macOS）。
- `open_mitm_ca_file(ca_pem_path)`
  - 打开证书文件，辅助用户手动安装。

## 5. 系统代理子模块

`system_proxy` 负责“应用代理 + 恢复快照”：

1. 启动时保存当前网络服务的 HTTP/HTTPS 代理配置；
2. 切换为本机代理；
3. 退出时（`ExitRequested` / `Exit`）恢复原配置。

macOS 实现细节（`network/macos.rs`）：

- 自动识别默认路由对应网络服务（必要时回退到第一个启用服务）；
- 通过 `networksetup` 读写 `-setwebproxy/-setsecurewebproxy`；
- 失败时回滚原配置。

## 6. MITM 证书安装实现

`mitm_install.rs` 的关键策略：

- 严格校验路径必须是绝对路径且指向 `.../mitm-ca-rsa/ca.pem`；
- macOS 使用 `osascript + security add-trusted-cert` 触发管理员授权；
- 提供 `open` 文件能力做手动安装兜底。

## 7. 资源与 sidecar 打包约束

`tauri.conf.json` 中：

- `bundle.externalBin` 声明 `binaries/proxy-app`；
- `bundle.resources` 携带 `frontend/dist`。

`prepare-tauri-sidecar.cjs` 会按 host target triple 复制并重命名 sidecar，确保 Tauri 能正确解析。

## 8. Agent 改动注意事项

1. 新增桌面命令时，需同步：
   - `#[tauri::command]` 定义；
   - `invoke_handler` 注册；
   - 前端调用（通常在 `isTauri()` 分支内）。
2. 所有系统级改动要考虑退出恢复路径，避免“改了系统配置但未恢复”。
3. sidecar 启动流程改动需兼顾 dev/release 双模式，避免仅在一种模式可用。
4. 涉及路径或命令执行时，优先做输入校验与失败回滚。
