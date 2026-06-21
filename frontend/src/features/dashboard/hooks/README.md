# dashboard/hooks

`dashboard/hooks/` 管理 dashboard 模块的状态编排与副作用逻辑。

## 当前 Hook

- `useDashboard.ts`：工作台整体状态管理（含 traffic/override → breakpoint 的字段桥接：`Add breakpoint` 改为仅回填“新建断点表单”并切到 breakpoints，不再自动创建；由用户显式保存后才真正新增）；同时把 `traffic` 中 pending 且命中 breakpoint 的请求映射到 breakpoints 面板，用于“继续放行”按钮与分组/条目命中态高亮。条目命中表（`matchedOverrideByEntryId`/`matchedBreakpointByEntryId`/`matchedTrafficEntryIds`）仅做 O(n) 读取后端写入的 `overrideMatchId`/`breakpointMatchId`，不再在前端整表跑正则匹配；复制 curl、保存请求、创建 override、导出 HAR 等需要完整请求的动作会按 id 拉取详情；traffic 暂停/恢复监听时通过后端 `/api/system-proxy` 同步关闭/打开系统 HTTP/HTTPS 代理，避免绑定具体桌面壳实现；并为全局搜索注册结果打开动作。
- `useAppWebSocket.ts`：应用级 WebSocket 通道与事件处理；WebSocket `traffic`/`snapshot` 只接收轻量摘要，高频消息先按 id 合并进缓冲区，再用 `requestAnimationFrame` 每帧统一 flush（单次 `setEntries`），`snapshot` 到达或卸载时取消调度并清空缓冲，避免重渲染风暴。

## 维护要求

新增 Hook 或调整 Hook 职责边界时，必须同步更新本文件。
