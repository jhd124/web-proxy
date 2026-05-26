# MCP 模块架构介绍（Agent 参考）

本文档覆盖 `mcp/` 下的 Proxy MCP Server，实现目标是把 dashboard 的代理能力以 MCP Tools 形式暴露给 Agent/外部自动化。

## 1. 组成与职责

`mcp/` 当前主要包含：

- `proxy-mcp-server.mjs`：基于 stdio 的 MCP server（JSON-RPC framing）。
- `README.md`：本地启动与 Cursor 接入说明。

该模块不是独立代理实现，而是 **dashboard API 的能力封装层**。

## 2. 技术架构

- 运行时：Node.js ESM 脚本。
- 协议：MCP over stdio（`Content-Length` framing + JSON-RPC）。
- 版本常量：
  - `PROTOCOL_VERSION = 2024-11-05`
  - `SERVER_NAME = proxy-dashboard-mcp`
- 默认后端地址：`http://127.0.0.1:9091`（可由 `PROXY_DASHBOARD_URL` 覆盖）。

## 3. Tool 列表与能力映射

当前暴露工具：

1. `listen_traffic`
   - 轮询 `/api/requests`；
   - 支持 `sinceId`、超时、poll 间隔、返回条数上限。
2. `filter_traffic`
   - 基于 query/method/host/status/error/pending/kind 在内存中过滤。
3. `add_override`
   - 映射到 `POST /api/overrides`。
4. `add_breakpoint`
   - 映射到 `POST /api/breakpoints`。
5. `operate_ui`
   - 映射到 `POST /api/ui/actions`（聚焦主窗、开浮窗、选中请求、设置过滤）。
6. `enable_proxy`
   - macOS 下调用 `networksetup` 开启系统 HTTP/HTTPS 代理。
7. `disable_proxy`
   - macOS 下关闭系统 HTTP/HTTPS 代理。

## 4. 与 backend 的关系

MCP server 的主路径是：

1. 接收 `tools/call`；
2. 参数校验与归一化；
3. 调用 dashboard REST API 或本地系统命令；
4. 将结果封装成 `structuredContent` 返回。

因此，任何 backend API 字段变化都可能影响 MCP 行为，尤其是：

- `/api/health`（`enable_proxy` 自动解析 `proxyPort`）；
- `/api/requests`（listen/filter 返回结构）；
- `/api/overrides` 与 `/api/breakpoints` 请求体字段。

## 5. 实现细节

### 5.1 JSON-RPC 处理

- 支持方法：`initialize`、`tools/list`、`tools/call`、`notifications/initialized`。
- 手动解析 stdin buffer，并按 `Content-Length` 逐帧读取。
- 返回格式统一为：
  - `content: [{ type: "text", text: JSON.stringify(...) }]`
  - `structuredContent: payload`

### 5.2 网络与命令执行

- API 调用统一封装在 `apiGetJson`/`apiPostJson`。
- 系统命令统一经 `spawnSync` 执行，并对非 0 退出码抛错。
- macOS 代理服务自动识别逻辑复用了 route + networksetup 信息解析。

## 6. Agent 改动注意事项

1. 若 backend API 字段新增/重命名，需同步更新对应 Tool 的 `inputSchema` 和 handler。
2. 新增 Tool 时需要同时更新：
   - `tools` 声明；
   - `callTool` 分发；
   - README 用法示例。
3. 涉及系统命令的 Tool 必须做平台判断与错误信息可读化。
4. `listen_traffic` 目前是轮询模型，若未来切换 WS 需要评估 timeout、稳定性与兼容性。
