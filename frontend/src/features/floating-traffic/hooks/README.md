# floating-traffic/hooks

`floating-traffic/hooks/` 管理悬浮流量详情模块的状态逻辑。

## 当前 Hook

- `useFloatingTraffic.ts`：悬浮详情状态与动作管理；列表沿用 traffic 摘要状态，选中项再按需加载完整详情，避免悬浮窗口常驻完整请求 body/header；详情加载期间由 UI 按 `selectedId` 保持侧板展开；并接入全局高级搜索，结果点击时聚焦主窗口。

## 维护要求

新增 Hook 或调整状态职责时，必须同步更新本文件。
