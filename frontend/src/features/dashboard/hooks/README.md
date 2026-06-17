# dashboard/hooks

`dashboard/hooks/` 管理 dashboard 模块的状态编排与副作用逻辑。

## 当前 Hook

- `useDashboard.ts`：工作台整体状态管理（含 traffic/override → breakpoint 的字段桥接：`Add breakpoint` 改为仅回填“新建断点表单”并切到 breakpoints，不再自动创建；由用户显式保存后才真正新增）；同时把 `traffic` 中 pending 且命中 breakpoint 的请求映射到 breakpoints 面板，用于“继续放行”按钮与分组/条目命中态高亮。条目命中表（`matchedOverrideByEntryId`/`matchedBreakpointByEntryId`/`matchedTrafficEntryIds`）仅做 O(n) 读取后端写入的 `overrideMatchId`/`breakpointMatchId`，不再在前端整表跑正则匹配；仅对单个选中条目保留 client-side 兜底，并将 traffic 层提供的“发起应用筛选候选项”透传给顶部筛选弹窗。
- `useAppWebSocket.ts`：应用级 WebSocket 通道与事件处理；高频 `traffic` 消息先按 id 合并进缓冲区，再用 `requestAnimationFrame` 每帧统一 flush（单次 `setEntries`），`snapshot` 到达或卸载时取消调度并清空缓冲，避免重渲染风暴。

## 维护要求

新增 Hook 或调整 Hook 职责边界时，必须同步更新本文件。
