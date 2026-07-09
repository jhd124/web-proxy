# traffic/ui

`traffic/ui/` 存放流量模块展示层组件与样式。

## 当前 UI

- `TrafficPanelUI*`：流量主面板（左侧列表初始宽度使用 `lib/panelLayout.ts` 的 `LEFT_LIST_PANEL_DEFAULT_SIZE`；分栏宽度通过 `react-resizable-panels` 的 `useDefaultLayout`（`localStorage` 持久化、按面板集合分别记忆）精确记住，切换 tab 或重选请求后恢复成同一宽度）；详情区按 `selectedId` 保持展开，完整 `TrafficEntry` 按需加载期间显示占位，避免重选请求时分栏闪烁；URL 尾部提供复制图标，URL、headers 与正文预览支持文本右键菜单（搜索、全局搜索、Decode/Format、用浏览器搜索），并会用全局搜索高亮 token 标记当前搜索关键词。
- `TrafficVirtualListUI*`：虚拟列表渲染容器（按「最新在上」用倒序索引直接映射，不再每次渲染复制并 `reverse` 整个数组；内部维护 `entryById/sourceIndexById/displayIndexById` 索引，选中项定位、右键菜单和滚动锚点不再重复 `find/findIndex`；单行抽成 `React.memo` 的 `TrafficRow`，派生值仅在摘要 props 变化时重算；列表显示列用全局搜索高亮 token 标记当前搜索关键词，并向页面检索注册虚拟跳转源，页内搜索优先复用后端 `searchText` 且对 append-only 更新增量合并结果；右键菜单提供复制 cURL、Highlight、保存请求、Override 与 Breakpoint 相关动作，并为各动作展示对应图标，不再提供重放入口；高亮条目以 `--amber-700` 呈现；回到顶部/聚焦选中项按钮复用 `components/ui/FloatingActionButton.tsx`）。
- `HighlightText.tsx`：按当前搜索关键词拆分文本并用 `<mark>` 渲染命中片段，供列表与详情复用。
- `TrafficFilterDialogUI*`：资源类型/请求方法/状态码/发起应用筛选弹窗（tag 复选；发起应用选项来自当前流量动态去重）。

## 维护要求

新增或调整流量 UI 组件时，必须同步更新本文件。
