# Frontend 架构介绍（Agent 参考）

本文档描述 `frontend/` 的技术栈、模块边界与实现要点，帮助 Agent 在实现 UI/交互能力时遵循现有模式。

## 1. 技术栈与运行方式

- 框架：React 19 + TypeScript。
- 构建：Vite。
- UI 体系：shadcn + 自定义 CSS Modules。
- 主要依赖：`@tanstack/react-virtual`（虚拟列表）、`@monaco-editor/react`（规则编辑器）、`sonner`（toast）。
- 宿主模式：
  - 浏览器模式（纯 Web）；
  - Electron 桌面模式（通过 `window.proxyDesktop` preload API 调用桌面能力）。

## 2. 总体架构模式

项目遵循 `portal + hooks + ui + texts` 分层：

1. `ui/`：纯展示组件，尽量不放业务逻辑；
2. `hooks/`：状态管理、请求、副作用；
3. `portal.tsx`：装配 hook 与 UI；
4. `texts.ts`：模块文案集中管理。

入口结构：

- `src/main.tsx`：挂载 React；
- `src/App.tsx`：根据 `?view=` 切换主仪表盘或浮窗视图；
- 常驻全局组件：`ConfirmModalHost`、`Toaster`。

## 3. 核心功能模块

### 3.1 Dashboard（`features/dashboard`）

`useDashboard` 是主编排 hook，整合：

- traffic 状态（`useTrafficState`）；
- override 编辑器状态（`useOverrideEditorState`）；
- breakpoint 状态（`useBreakpointState`）；
- saved requests 状态（`useSavedRequests`）；
- WebSocket 实时同步（`useAppWebSocket`）。

同时负责：

- 读取 `/api/health` 初始化环境状态（MITM、代理地址、抓包状态）；
- 控制抓包暂停/恢复；
- 桌面端打开浮动窗口与设置系统代理；
- 选中请求的“匹配 override / breakpoint”联动跳转。

### 3.2 Traffic（`features/traffic`）

`useTrafficState` 管理：

- `entries`、`selectedId`、`urlFilter`；
- 清空流量；
- 断点继续（resume）；
- 流控 play/pause。

并提供筛选与选中项派生状态（如是否 SSE）。

### 3.3 Override Editor（`features/override-editor`）

职责：

- 维护 override 表单与规则列表；
- 支持响应头/响应体编辑；
- Monaco 支持 body 格式化与语言判断；
- 创建/更新/删除/启用规则；
- 与流量选中项联动填充匹配字段。

### 3.4 Breakpoints（`features/breakpoints`）

职责：

- 断点列表与 CRUD；
- 启停状态切换；
- 支持从选中流量或 override 快速生成断点。

### 3.5 Floating Traffic（`features/floating-traffic`）

职责：

- 独立的小窗流量视图；
- 复用 `useAppWebSocket + useTrafficState`；
- 支持将选中请求“拉回主窗口”。

### 3.6 Saved Requests（`features/saved-requests`）

职责：

- 拉取已保存请求；
- 保存当前请求快照；
- 删除单条或清空。

## 4. 与后端通信模型

### 4.1 REST

前端通过 `fetch('/api/...')` 直接调用 dashboard API，典型场景：

- 规则 CRUD；
- 流量列表与清空；
- 断点继续/流控；
- 健康检查与抓包控制；
- saved requests 管理。

### 4.2 WebSocket

`useAppWebSocket` 负责：

- 连接 `/ws`；
- 处理 `snapshot/traffic/overrides_updated/breakpoints_updated/ui_action`；
- 自动重连；
- 首次连接后回补 `GET /api/requests`，降低短暂断连丢失风险。

## 5. 样式与主题

- 样式主用 CSS Modules（按功能模块拆分）。
- 全局样式入口：`src/index.css`。
- 主题 token：`src/theme/token.css`、`src/theme/theme.css`。

## 6. 关键实现细节

1. 流量列表有上限裁剪（`trimTrafficEntries`），避免无限增长。
2. 大量操作仍在使用 `window.alert`，项目已有 `src/lib/toast.ts` 可逐步迁移到 toast 反馈。
3. 通过 `desktopHost` 做环境分支，避免 Web 模式直接调用桌面 API。
4. UI action 通过 WS 下发，可触发聚焦主窗、选中请求、设置过滤条件等跨窗行为。

## 7. Agent 改动注意事项

1. 新功能优先落在对应 `feature` 下，遵循 `portal/hooks/ui/texts` 结构。
2. 新增文案放 `texts.ts`，避免散落在组件内。
3. 引入副作用时必须提供清理逻辑（WebSocket、事件监听、定时器）。
4. 新增后端字段或消息类型时，同步更新：
   - `src/types.ts`
   - 对应 hook 的解析逻辑
   - UI 展示与空值处理。
5. 涉及高频更新（流量流式场景）时，优先考虑渲染与内存开销（虚拟列表/剪裁/去重更新）。
