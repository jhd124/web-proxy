# dashboard/hooks

`dashboard/hooks/` 管理 dashboard 模块的状态编排与副作用逻辑。

## 当前 Hook

- `useDashboard.ts`：工作台整体状态管理（含 traffic→breakpoint 的字段桥接：新增断点时统一携带并回填 origin）。
- `useAppWebSocket.ts`：应用级 WebSocket 通道与事件处理。

## 维护要求

新增 Hook 或调整 Hook 职责边界时，必须同步更新本文件。
