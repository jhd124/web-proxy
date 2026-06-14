# traffic/ui

`traffic/ui/` 存放流量模块展示层组件与样式。

## 当前 UI

- `TrafficPanelUI*`：流量主面板（左侧列表初始宽度使用 `lib/panelLayout.ts` 的 `LEFT_LIST_PANEL_DEFAULT_SIZE`；分栏宽度通过 `react-resizable-panels` 的 `useDefaultLayout`（`localStorage` 持久化、按面板集合分别记忆）精确记住，切换 tab 或重选请求后恢复成同一宽度）。
- `TrafficVirtualListUI*`：虚拟列表渲染容器。
- `TrafficFilterDialogUI*`：资源类型/请求方法/状态码筛选弹窗（tag 复选）。

## 维护要求

新增或调整流量 UI 组件时，必须同步更新本文件。
