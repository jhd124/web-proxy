# Agent 参考文档索引

以下文档用于帮助 Agent 快速理解项目结构与实现边界：

- `docs/agent-reference/backend.md`：`backend/`（Rust proxy + dashboard API）架构说明
- `docs/agent-reference/frontend.md`：`frontend/`（React dashboard）架构说明
- `docs/agent-reference/desktop.md`：`desktop/`（Electron 宿主）架构说明
- `docs/agent-reference/mcp.md`：`mcp/`（Proxy MCP Server）架构说明

建议在以下场景优先阅读：

1. 新增功能需跨模块联动（如 API + UI + 桌面命令）；
2. 调整流量链路（CONNECT/MITM/override/breakpoint）；
3. 需要为 Agent 增强自动化工具能力（MCP）。
