# LeoProxy MCP Server

`proxy-mcp-server.mjs` 是一个 MCP Server，支持 `stdio` 与 `http` 两种 transport，把 dashboard 的 HTTP API 与部分系统代理操作封装成 MCP tools，供 Cursor Agent 或外部自动化脚本调用。

**本地 MCP 不需要 OAuth。** 若 Cursor 出现 `mcp_auth` / 一直 loading，通常是 MCP 进程未起来或 dashboard 不可达，而不是要登录。先确认 LeoProxy 已启动，再调用 `get_status`。

## 目录

- `proxy-mcp-server.mjs`：MCP Server 启动入口
- `src/constants.mjs`：协议与服务常量、通用参数归一化、`SERVER_INSTRUCTIONS`
- `src/tools.mjs`：聚合 tool 列表
- `src/toolDefs/`：按域拆分的 tool schema（rule / traffic / system）
- `src/toolRouter.mjs`：tool 到 handler 的分发表
- `src/protocol.mjs`：MCP JSON-RPC 协议处理（initialize/tools/list/tools/call）
- `src/rpcServer.mjs`：stdio transport
- `src/httpServer.mjs`：http transport（`POST /mcp`）
- `src/apiClient.mjs`：dashboard API 调用（带超时与不可达错误文案）
- `src/systemProxy.mjs`：macOS 系统代理启停与状态查询
- `src/handlers/`：业务 handler（status / mapRemote / rules / traffic / hosts）
- `src/toolDefs/`：Agent 可读的 tool description 与 input schema

## 能力清单

### 状态与意图

- `get_status`：聚合 health、系统代理、capturePaused、MITM、override 摘要；dashboard 不可达时明确返回错误说明
- `map_remote`：意图级「把 A 转到 target」——幂等 upsert map-remote 规则，可选 `ensureProxy=true` 开启系统代理，并探测 target

### Override CRUD

- `list_overrides`：列出规则（避免重复创建）
- `add_override`：创建规则（map-remote 场景优先用 `map_remote`）
- `update_override` / `delete_override` / `set_override_enabled`

### 流量

- `listen_traffic` / `filter_traffic`：列表级流量
- `get_request`：单条详情（headers / body preview / timing / error）
- `clear_traffic` / `pause_capture` / `resume_capture`

### 其他

- `add_breakpoint`：创建断点规则
- `operate_ui`：dashboard UI 动作
- `enable_proxy` / `disable_proxy`：macOS 系统代理
- `list_hosts` / `upsert_host` / `remove_host` / `apply_hosts` / `revert_hosts`

> 各 tool **不再暴露** `dashboardUrl` 参数（减少 Agent 噪音）；默认 `http://127.0.0.1:9091`，可用环境变量 `PROXY_DASHBOARD_URL` 覆盖。

## map_remote 示例

把 `https://platform.test.bohrium.com/*` 转到 `http://localhost:3000/*`：

```json
{
  "name": "map_remote",
  "arguments": {
    "matchHost": "platform.test.bohrium.com",
    "target": "http://localhost:3000",
    "matchProtocol": "https",
    "ensureProxy": true
  }
}
```

等价的底层 `add_override` 字段：`matchProtocol=https`, `matchHost=...`, `matchPath=*`, `mapRemoteProtocol=http`, `mapRemoteHost=localhost:3000`, `mapRemotePath=*`。

## 启动方式

### 1) stdio（默认，Cursor 推荐）

```bash
node mcp/proxy-mcp-server.mjs
```

### 2) http（桌面应用内常驻）

```bash
PROXY_MCP_TRANSPORT=http node mcp/proxy-mcp-server.mjs
```

可选参数：

- 命令行：`--transport=http`
- 环境变量：`PROXY_MCP_TRANSPORT=http`

## 环境变量

- `PROXY_DASHBOARD_URL`：dashboard 地址，默认 `http://127.0.0.1:9091`
- `PROXY_MCP_TRANSPORT`：`stdio`（默认）或 `http`
- `PROXY_MCP_HTTP_HOST`：http 监听 host，默认 `127.0.0.1`
- `PROXY_MCP_HTTP_PORT`：http 监听端口，默认 `19091`

## 接入示例

### Cursor（stdio）

```json
{
  "mcpServers": {
    "LeoProxy": {
      "command": "node",
      "args": ["/Users/dp/proxy/mcp/proxy-mcp-server.mjs"],
      "env": {
        "PROXY_DASHBOARD_URL": "http://127.0.0.1:9091"
      }
    }
  }
}
```

### HTTP 客户端（应用内常驻 MCP）

- endpoint：`POST http://127.0.0.1:19091/mcp`
- health：`GET http://127.0.0.1:19091/health`
- body：标准 JSON-RPC（MCP）请求

示例（列出 tools）：

```bash
curl -sS -X POST "http://127.0.0.1:19091/mcp" \
  -H "content-type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":"1",
    "method":"tools/list",
    "params":{}
  }'
```

## 可靠性说明

- dashboard 请求默认 **5s 超时**；连接失败/超时时返回明确文案：`LeoProxy 未启动或 dashboard 不可达`，而不是一直挂起
- `initialize` 不依赖 dashboard，也不要求认证
- 推荐 Agent 工作流：`get_status` →（需要时）`map_remote` / `list_overrides` → `filter_traffic` + `get_request`

## 代理控制说明（macOS）

`enable_proxy` 与 `disable_proxy` 依赖 `networksetup`，目前只支持 macOS。`get_status` 会附带当前系统代理开关摘要。

## Hosts 控制说明

`list_hosts`、`upsert_host`、`remove_host` 操作的是 dashboard 后端保存的托管配置；`apply_hosts` 与 `revert_hosts` 只调用 dashboard 后端接口，系统 hosts 文件的读写统一由后端进程完成。

## 开发约束

- 新增 tool 时，必须同时更新：
  - `src/toolDefs/*` 列表定义
  - `TOOL_HANDLERS` 分发表
  - 本文档能力清单
  - `docs/agent-reference/mcp.md`
- 若 dashboard API 字段变化，需同步更新 `inputSchema` 与对应 handler 映射字段。
- transport 层改动时，需同时验证 `stdio` 与 `http` 的协议一致性（方法、返回结构、错误码）。
