# Backend 架构介绍（Agent 参考）

本文档描述 `backend/`（Rust crate: `proxy-app`）的技术架构、核心模块与关键实现细节，便于 Agent 在改动代理链路、规则系统或 API 时快速定位。

## 1. 技术栈与职责边界

- 语言与运行时：Rust 2021 + Tokio。
- 网络栈：`hyper`/`hyper-util`（入站代理服务）、`reqwest`（上游转发客户端）。
- Web API：`axum` + `tower-http`（REST + WebSocket + 静态资源）。
- 存储：`rusqlite`（override 与 saved requests）。
- TLS MITM：`rustls` + `tokio-rustls` + `rcgen`。

职责上，`backend` 承担：

1. HTTP/HTTPS 代理与转发；
2. MITM 解密与证书签发；
3. override/breakpoint 匹配与执行；
4. 流量内存缓存与实时推送；
5. dashboard 的 REST/WS 服务与静态文件托管。

## 2. 启动流程（`src/main.rs`）

后端启动主线如下：

1. 读取环境变量（`MAX_TRAFFIC`、`MITM`、`UPSTREAM_HTTP3`、`PROXY_DATA_DIR` 等）。
2. 初始化 MITM CA（可选）与 SQLite（overrides / saved requests）。
3. 初始化共享状态 `AppState`。
4. 解析监听端口（proxy + dashboard）。
5. 并发启动两个服务：
   - `proxy::run_proxy(...)`：代理入口；
   - `api::run_dashboard(...)`：管理 API + 前端静态资源。

## 3. 模块分层

`backend/src` 关键模块：

- `proxy.rs`：代理核心（CONNECT、MITM、上游转发、SSE 流控、override/breakpoint 执行）。
- `api.rs`：dashboard API 与 WebSocket 广播入口。
- `state.rs`：核心领域模型与全局共享状态（流量、规则、pending 控制、UI action）。
- `mitm.rs`：本地 CA 创建/加载、动态叶子证书签发、ALPN 配置与缓存。
- `overrides.rs`：override 规则 CRUD 与持久化。
- `breakpoints.rs`：breakpoint 规则 CRUD。
- `saved_requests.rs`：已保存请求管理。
- `body_format.rs`：请求/响应 body 格式化相关 API。
- `override_identity.rs`：override 身份 hash 生成等辅助逻辑。

## 4. 请求处理链路

### 4.1 普通 HTTP

1. 入站请求进入 `handle_http_proxy`。
2. 归一化 URL 与 request body，生成 `TrafficEntry`。
3. 先匹配 breakpoint（可挂起等待恢复），再匹配 override。
4. 命中本地 override 时直接回包；否则用 `reqwest` 转发上游。
5. 更新 `TrafficEntry`（状态码、头、preview、耗时、错误）并经 WS 广播。

### 4.2 HTTPS（CONNECT）

CONNECT 路径分三种：

1. **透明隧道**：直接 `copy_bidirectional`。
2. **MITM 解密**：TLS 终止后把明文 HTTP 请求重新走转发链路。
3. **自动 bypass**：MITM 握手失败后按 host 自动降级为透明隧道（`auto_mitm_bypass_hosts`）。

实现重点：

- 会先 `peek` 前几个字节判断是不是 TLS ClientHello，避免对非 TLS 协议误做 MITM。
- 握手失败按类型分类（证书拒绝/EOF/其他），决定是否自动加入 bypass。

## 5. 规则系统（Override / Breakpoint）

### 5.1 Override

`OverrideRule` 支持：

- 匹配条件：协议、host（支持 `*`/`?`）、path、请求头、query、请求体；
- 响应动作：状态码、响应头、body；响应头值为 `*` 时用同名请求头回填；
- map remote：将请求改写后转发到另一目标，规则中的响应头按同名覆盖上游响应头；
- stream interval：按分段间隔返回内容（常用于 SSE 模拟）。

### 5.2 Breakpoint

`BreakpointRule` 通过 `matchOrigin + matchPathRegex` 匹配后：

- 将请求标记为 pending；
- 前端可通过 `/api/requests/:id/resume` 放行；
- 与 stream 控制联合使用时可通过 play/pause 控制节奏。

## 6. 状态与实时通信

`AppState` 是共享中心，核心字段包括：

- `traffic`：内存中流量列表（受 `max_traffic` 上限保护）。
- `tx`：`broadcast::Sender<DashboardMessage>`，向前端 WS 广播。
- `overrides` / `breakpoints`：规则集缓存。
- `pending_requests`：断点挂起请求恢复通道。
- `stream_controllers`：流式响应播放状态控制。
- `capture_paused`：抓包暂停标志。

WS 消息类型：

- `snapshot`
- `traffic`
- `overrides_updated`
- `breakpoints_updated`
- `ui_action`

## 7. Dashboard API 概览

`api.rs` 暴露的主要端点：

- 健康与环境：`GET /api/health`
- 流量：`GET/DELETE /api/requests`
- 抓包控制：`POST /api/capture/pause|resume`
- MITM：`GET /api/mitm/ca.pem`、`POST /api/mitm/auto-bypass`
- override：`GET/POST/PUT/DELETE /api/overrides...`
- breakpoint：`GET/POST/PUT/DELETE /api/breakpoints...`
- saved requests：`GET/POST/DELETE /api/saved-requests...`
- UI 动作：`POST /api/ui/actions`
- 断点/流控：`POST /api/requests/:id/resume|stream/play|stream/pause`
- 实时：`GET /ws`

## 8. Agent 改动注意事项

1. 涉及请求匹配或规则字段时，要同步检查：
   - `state.rs` 类型定义；
   - `overrides.rs` / `breakpoints.rs` 的序列化与持久化；
   - 前端 `src/types.ts` 与相关表单。
2. 涉及 CONNECT/MITM 逻辑时，优先保证“失败可降级透明代理”，避免请求完全中断。
3. 新增 API 后，要评估是否需要：
   - 写入 `DashboardMessage` 广播；
   - 增加 health 字段；
   - 被 MCP server 暴露。
4. 内存敏感路径（SSE、traffic 缓存）避免无上限缓冲。
