# saved-requests/ui

`saved-requests/ui/` 存放已保存请求模块的展示组件与样式。

## 当前 UI

- `SavedRequestsPanelUI.tsx`：已保存请求面板。左侧为按域名（host）分组的可折叠列表（复用 `components/host-group-list`），右侧为选中请求的详情；左右两栏宽度可拖拽调整（`components/ui/resizable`）。左侧列表默认宽度与 traffic / override / breakpoints 页面统一，复用 `lib/panelLayout.ts` 常量。
- `SavedRequestsPanelUI.module.css`：面板样式（列表项、详情区与可调栏布局）。

## 维护要求

新增或调整已保存请求 UI 组件时，必须同步更新本文件。
