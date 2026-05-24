# Proxy MCP Server

`proxy-mcp-server.mjs` 是一个基于 stdio 的 MCP server，封装了 dashboard 的核心能力：

1. 监听流量（`listen_traffic`）
2. 筛选流量（`filter_traffic`）
3. 添加 override（`add_override`）
4. 添加 breakpoint（`add_breakpoint`）
5. 操作 UI（`operate_ui`）
6. 开启系统代理（`enable_proxy`，macOS）
7. 关闭系统代理（`disable_proxy`，macOS）

## 启动

```bash
node mcp/proxy-mcp-server.mjs
```

可选环境变量：

- `PROXY_DASHBOARD_URL`：dashboard 地址（默认 `http://127.0.0.1:9091`）

## 代理控制工具说明

- `enable_proxy`
  - 默认自动识别当前主网络服务，并把系统 HTTP/HTTPS 代理设为 `127.0.0.1:<proxyPort>`
  - `proxyPort` 未传时，会自动从 `/api/health` 读取 `proxyPort`
  - 可选参数：`serviceName`、`proxyPort`
- `disable_proxy`
  - 默认自动识别当前主网络服务，并关闭该服务的系统 HTTP/HTTPS 代理
  - 可选参数：`serviceName`

> 这两个工具当前仅支持 macOS（调用 `networksetup`）。

## Cursor MCP 配置示例

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
