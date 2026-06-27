# dashboard/ui

`dashboard/ui/` 存放 dashboard 模块的纯展示组件与样式。

## 当前 UI

- `DashboardUI*`：工作台主布局（负责把 traffic/override 触发的断点“预填新建表单”动作透传到 breakpoints 面板，并按 active tab 渲染 traffic/override/breakpoints/saved/request-composer/settings）。
- `DashboardHeaderUI*`：顶部区域（含关键词搜索与高级筛选入口；高级筛选支持按资源类型/方法/状态码/发起应用过滤；代理监听地址始终展示，不可用时显示占位文案；桌面壳环境下额外提供「启动可抓 localhost 的浏览器」入口，见 `CaptureBrowserMenu`）。
- `CaptureBrowserMenu*`：用 `Globe` 图标的浏览器启动入口；后端扫描出的 Chromium 内核浏览器仅一个时点击直接启动，多个时弹出 Popover 菜单按名称选择；列表为空（如非桌面壳）时不渲染。
- `DashboardSidebarUI*`：侧边导航区域（Breakpoint 导航图标使用 `StepForward`，请求编写器入口使用 `NotebookPen`）。

## 维护要求

新增、删除或重构 UI 组件时，必须同步更新本文件。
