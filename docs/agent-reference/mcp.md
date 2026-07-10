# MCP 模块架构介绍（Agent 参考）

本文档描述 `mcp/` 模块在仓库中的职责、实现结构与维护要点。该模块核心目标是：把 dashboard 的关键能力以 MCP tools 形式提供给 Agent/自动化调用。

## 1. 模块定位

- `mcp/` 是能力适配层，不实现代理核心逻辑
- 真实业务状态与规则由 dashboard API 持有
- MCP 负责：
  - 接收 `tools/call`
  - 做输入归一化
  - 转发 REST API 或执行本地系统命令
  - 回包 `structuredContent`
- **不需要 OAuth**：本地 dashboard 直连；`initialize` 不依赖 dashboard

## 2. 目录结构

- `mcp/proxy-mcp-server.mjs`：MCP server 启动入口
- `mcp/src/constants.mjs`：协议版本、服务信息、`SERVER_INSTRUCTIONS`、通用参数处理
- `mcp/src/tools.mjs`：聚合 tool 清单
- `mcp/src/toolDefs/`：按域拆分的 schema（`ruleTools` / `trafficTools` / `systemTools`）
- `mcp/src/toolRouter.mjs`：tool 分发与 handler 绑定
- `mcp/src/protocol.mjs`：MCP JSON-RPC 协议层（initialize 含 instructions）
- `mcp/src/rpcServer.mjs`：stdio transport
- `mcp/src/httpServer.mjs`：http transport（`POST /mcp` + `GET /health`）
- `mcp/src/apiClient.mjs`：dashboard API 访问层（超时 + 不可达错误）
- `mcp/src/systemProxy.mjs`：macOS 系统代理命令封装与状态查询
- `mcp/src/handlers/statusHandlers.mjs`：`get_status`
- `mcp/src/handlers/mapRemoteHandler.mjs`：`map_remote` 意图工具
- `mcp/src/handlers/ruleHandlers.mjs`：override CRUD / breakpoint / UI
- `mcp/src/handlers/trafficHandlers.mjs`：listen/filter/get/clear/pause/resume
- `mcp/src/handlers/hostsHandlers.mjs`：hosts 托管
- `mcp/README.md`：接入与维护说明

## 3. 技术栈与协议

- 运行时：Node.js ESM
- 传输：
  - stdio（`Content-Length` framing）
  - http（`POST /mcp`，返回 JSON-RPC）
- 协议版本：`2024-11-05`
- 默认 dashboard 地址：`http://127.0.0.1:9091`（可由 `PROXY_DASHBOARD_URL` 覆盖）
- dashboard 请求超时：`DASHBOARD_FETCH_TIMEOUT_MS`（默认 5000）
- http 默认监听：`127.0.0.1:19091`（可由 `PROXY_MCP_HTTP_HOST/PORT` 覆盖）

## 4. Tool 能力映射

### 状态 / 意图

1. `get_status` → `/api/health` + `/api/overrides` + macOS `networksetup` 代理状态；不可达时返回结构化失败（不挂起）
2. `map_remote` → 幂等 upsert `/api/overrides`（map-remote 字段）+ 可选 `enable_proxy` + target 探测

### Override

3. `list_overrides` → `GET /api/overrides`
4. `add_override` → `POST /api/overrides`
5. `update_override` → `PUT /api/overrides/:id`（先读后合并）
6. `delete_override` → `DELETE /api/overrides/:id`
7. `set_override_enabled` → 读规则后 `PUT` 仅改 `enabled`

### 流量

8. `listen_traffic` / `filter_traffic` → `GET /api/requests`（列表级）
9. `get_request` → `GET /api/requests/:id`
10. `clear_traffic` → `DELETE /api/requests`
11. `pause_capture` / `resume_capture` → `POST /api/capture/pause|resume`

### 其他

12. `add_breakpoint` → `POST /api/breakpoints`
13. `operate_ui` → `POST /api/ui/actions`
14. `enable_proxy` / `disable_proxy` → macOS `networksetup`
15. hosts 系列 → `/api/hosts*`

Tool schema **默认不暴露** `dashboardUrl`；地址仅由环境变量解析。

## 5. 关键实现约束

- `tools` 数组与 `TOOL_HANDLERS` 分发表必须保持一一对应
- API 访问统一走 `apiGetJson` / `apiPostJson` / `apiPutJson` / `apiDelete`
- 系统命令统一走 `spawnSync` 包装并在非 0 退出码时报错
- 代理控制工具必须保留平台判断（当前仅 macOS）
- `proxy-mcp-server.mjs` 仅保留启动与装配逻辑，业务 handler 不应回流到入口文件
- 协议方法处理统一收敛在 `protocol.mjs`，避免 stdio/http 语义漂移
- tool description 应包含 canonical 用法（尤其 map-remote），减少 Agent 试错

## 6. 与 backend 的耦合点

以下接口字段变化会直接影响 MCP：

- `/api/health`：`get_status` / `enable_proxy` 自动解析 `proxyPort`、`capturePaused`、`mitmEnabled`
- `/api/requests`、`/api/requests/:id`：流量列表与详情
- `/api/requests` DELETE、`/api/capture/pause|resume`：清流量与暂停抓包
- `/api/overrides` CRUD：规则列表与 upsert
- `/api/breakpoints`：创建断点
- `/api/ui/actions`：`operate_ui` 支持的动作集合

## 7. 维护清单（Agent 必做）

当你修改 `mcp/` 时，至少同步检查：

1. Tool schema 是否与 handler 入参一致
2. `tools` 与 `TOOL_HANDLERS` 是否同步增删
3. `mcp/README.md` 能力说明是否仍然准确
4. `docs/agent-reference/mcp.md` 架构描述是否仍然准确
5. stdio 与 http 两条 transport 的返回结构是否一致
6. dashboard 不可达时的错误文案是否仍清晰（无 OAuth 暗示）
