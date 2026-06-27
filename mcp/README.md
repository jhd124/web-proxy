# Proxy MCP Server

`proxy-mcp-server.mjs` 是一个 MCP Server，支持 `stdio` 与 `http` 两种 transport，把 dashboard 的 HTTP API 与部分系统代理操作封装成 MCP tools，供 Cursor Agent 或外部自动化脚本调用。

## 目录

- `proxy-mcp-server.mjs`：MCP Server 启动入口
- `src/constants.mjs`：协议与服务常量、通用参数归一化
- `src/tools.mjs`：MCP tools 定义与 input schema
- `src/toolRouter.mjs`：tool 到 handler 的分发表
- `src/protocol.mjs`：MCP JSON-RPC 协议处理（initialize/tools/list/tools/call）
- `src/rpcServer.mjs`：stdio transport
- `src/httpServer.mjs`：http transport（`POST /mcp`）
- `src/apiClient.mjs`：dashboard API 调用封装
- `src/systemProxy.mjs`：macOS 系统代理启停能力
- `src/handlers/trafficHandlers.mjs`：流量监听与过滤 handler
- `src/handlers/ruleHandlers.mjs`：override/breakpoint/UI 操作 handler
- `src/handlers/hostsHandlers.mjs`：hosts 托管配置 handler

## 能力清单

- `listen_traffic`：轮询并监听新流量
- `filter_traffic`：按 query/method/host/status/error/pending/kind 过滤流量
- `add_override`：创建 override 规则（映射 `POST /api/overrides`）
- `add_breakpoint`：创建 breakpoint 规则（映射 `POST /api/breakpoints`）
- `operate_ui`：执行 dashboard UI 动作（聚焦窗口、打开浮窗、选中请求、设置过滤）
- `enable_proxy`：开启 macOS 系统 HTTP/HTTPS 代理
- `disable_proxy`：关闭 macOS 系统 HTTP/HTTPS 代理
- `list_hosts`：查看托管 hosts 条目与系统应用状态
- `upsert_host`：新增或更新一个托管 hosts 条目
- `remove_host`：按 hostname 删除一个托管 hosts 条目
- `apply_hosts`：请求 dashboard 后端将托管区块写入系统 hosts
- `revert_hosts`：请求 dashboard 后端从系统 hosts 移除托管区块

## 启动方式

### 1) stdio（默认）

```bash
node mcp/proxy-mcp-server.mjs
```

### 2) http（网络可连接）

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
    "proxy-dashboard": {
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

## 代理控制说明（macOS）

`enable_proxy` 与 `disable_proxy` 依赖 `networksetup`，目前只支持 macOS。

- `enable_proxy`
  - 自动识别主网络服务后设置系统 HTTP/HTTPS 代理
  - `proxyPort` 未传时，自动从 `/api/health` 读取
  - 可选参数：`serviceName`、`proxyPort`
- `disable_proxy`
  - 自动识别主网络服务后关闭系统 HTTP/HTTPS 代理
  - 可选参数：`serviceName`

## Hosts 控制说明

`list_hosts`、`upsert_host`、`remove_host` 操作的是 dashboard 后端保存的托管配置；`apply_hosts` 与 `revert_hosts` 只调用 dashboard 后端接口，系统 hosts 文件的读写统一由后端进程完成。后端进程需要具备写入系统 hosts 文件的权限。

## 开发约束

- 新增 tool 时，必须同时更新：
  - `src/tools.mjs` 列表定义
  - `TOOL_HANDLERS` 分发表
  - 本文档能力清单
- 若 dashboard API 字段变化，需同步更新 `inputSchema` 与对应 handler 映射字段。
- transport 层改动时，需同时验证 `stdio` 与 `http` 的协议一致性（方法、返回结构、错误码）。
