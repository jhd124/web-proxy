# page-search/hooks

`page-search/hooks/` 管理页面检索显隐、输入、匹配数量与高亮副作用。

## 当前 Hook

- `usePageSearch.ts`：监听不带 Shift 的 `Cmd+F` 唤起搜索框，维护搜索关键词、搜索框可见性、页面高亮启用状态、匹配数量和当前跳转位置；全局搜索可隐藏小搜索框但继续复用页面高亮，关闭全局搜索后可按关键词恢复显示小搜索框；使用 `MutationObserver` 监听页面内容变化，并在关闭、卸载或关键词变化时清理高亮与调度任务；支持虚拟列表等模块注册自己的可跳转结果源。
- `usePageSearchDomHighlights.ts`：封装普通 DOM 文本 Range 的收集、CSS Custom Highlight 生命周期和 DOM 变化监听。

## 维护要求

新增 Hook 或调整 Hook 职责边界时，必须同步更新本文件。
