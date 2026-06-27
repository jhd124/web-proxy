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

## 2. 目录结构

- `mcp/proxy-mcp-server.mjs`：MCP server 启动入口
- `mcp/src/constants.mjs`：协议版本、服务信息、通用参数处理
- `mcp/src/tools.mjs`：tool 清单与 schema
- `mcp/src/toolRouter.mjs`：tool 分发与 handler 绑定
- `mcp/src/protocol.mjs`：MCP JSON-RPC 协议层（initialize/tools/list/tools/call）
- `mcp/src/rpcServer.mjs`：stdio transport
- `mcp/src/httpServer.mjs`：http transport（`POST /mcp` + `GET /health`）
- `mcp/src/apiClient.mjs`：dashboard API 访问层
- `mcp/src/systemProxy.mjs`：macOS 系统代理命令封装
- `mcp/src/handlers/trafficHandlers.mjs`：listen/filter handler
- `mcp/src/handlers/ruleHandlers.mjs`：override/breakpoint/UI handler
- `mcp/README.md`：接入与维护说明

## 3. 技术栈与协议

- 运行时：Node.js ESM
- 传输：
  - stdio（`Content-Length` framing）
  - http（`POST /mcp`，返回 JSON-RPC）
- 协议版本：`2024-11-05`
- 默认 dashboard 地址：`http://127.0.0.1:9091`（可由 `PROXY_DASHBOARD_URL` 覆盖）
- http 默认监听：`127.0.0.1:19091`（可由 `PROXY_MCP_HTTP_HOST/PORT` 覆盖）

## 4. Tool 能力映射

1. `listen_traffic`
   - 轮询 `/api/requests` 并返回新增请求
   - 支持 `sinceId`、`timeoutMs`、`pollIntervalMs`、`limit`
2. `filter_traffic`
   - 从 `/api/requests` 拉取后在内存过滤
3. `add_override`
   - `POST /api/overrides`
4. `add_breakpoint`
   - `POST /api/breakpoints`
5. `operate_ui`
   - `POST /api/ui/actions`
6. `enable_proxy`
   - macOS 使用 `networksetup` 开启系统 HTTP/HTTPS 代理
7. `disable_proxy`
   - macOS 使用 `networksetup` 关闭系统 HTTP/HTTPS 代理

## 5. 关键实现约束

- `tools` 数组与 `TOOL_HANDLERS` 分发表必须保持一一对应
- API 访问统一走 `apiGetJson` / `apiPostJson`
- 系统命令统一走 `spawnSync` 包装并在非 0 退出码时报错
- 代理控制工具必须保留平台判断（当前仅 macOS）
- `proxy-mcp-server.mjs` 仅保留启动与装配逻辑，业务 handler 不应回流到入口文件
- 协议方法处理统一收敛在 `protocol.mjs`，避免 stdio/http 语义漂移

## 6. 与 backend 的耦合点

以下接口字段变化会直接影响 MCP：

- `/api/health`：`enable_proxy` 自动解析 `proxyPort`
- `/api/requests`：`listen_traffic` / `filter_traffic` 的返回兼容性
- `/api/overrides`、`/api/breakpoints`：创建规则请求体字段
- `/api/ui/actions`：`operate_ui` 支持的动作集合

## 7. 维护清单（Agent 必做）

当你修改 `mcp/` 时，至少同步检查：

1. Tool schema 是否与 handler 入参一致
2. `tools` 与 `TOOL_HANDLERS` 是否同步增删
3. `mcp/README.md` 能力说明是否仍然准确
4. `docs/agent-reference/mcp.md` 架构描述是否仍然准确
5. stdio 与 http 两条 transport 的返回结构是否一致
