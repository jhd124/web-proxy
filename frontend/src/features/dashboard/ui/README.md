# dashboard/ui

`dashboard/ui/` 存放 dashboard 模块的纯展示组件与样式。

## 当前 UI

- `DashboardUI*`：工作台主布局（负责把 traffic/override 触发的断点“预填新建表单”动作透传到 breakpoints 面板）。
- `DashboardHeaderUI*`：顶部区域（含关键词与高级筛选入口；高级筛选支持按资源类型/方法/状态码/发起应用过滤；代理监听地址始终展示，不可用时显示占位文案）。
- `DashboardSidebarUI*`：侧边导航区域（Breakpoint 导航图标使用 `StepForward`）。

## 维护要求

新增、删除或重构 UI 组件时，必须同步更新本文件。
