# dashboard/hooks

`dashboard/hooks/` 管理 dashboard 模块的状态编排与副作用逻辑。

## 当前 Hook

- `useDashboard.ts`：工作台整体状态管理（含 traffic/override → breakpoint 的字段桥接：`Add breakpoint` 改为仅回填“新建断点表单”并切到 breakpoints，不再自动创建；由用户显式保存后才真正新增）；同时把 `traffic` 中 pending 且命中 breakpoint 的请求映射到 breakpoints 面板，用于“继续放行”按钮与分组/条目命中态高亮。
- `useAppWebSocket.ts`：应用级 WebSocket 通道与事件处理。

## 维护要求

新增 Hook 或调整 Hook 职责边界时，必须同步更新本文件。
