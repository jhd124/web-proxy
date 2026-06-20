# advanced-search/ui

`advanced-search/ui/` 存放高级搜索的纯展示组件与样式。

## 当前 UI

- `AdvancedSearchPanelUI*`：全局底部可调高度搜索面板，通过 `hidden` 控制可见性以保留组件状态。顶部提供查询输入、搜索按钮、关闭按钮与最小化按钮，点击搜索按钮或按 Enter 后请求结果；最小化后显示复用 `FloatingActionButton` 的右下角 `PackageOpen` 悬浮按钮；主体按 traffic、override、breakpoint、saved 分组展示匹配行；每行展示实体标题、命中字段和带关键词高亮的节选，点击后触发外部注册的打开动作。

## 维护要求

新增或调整高级搜索 UI 时，必须同步更新本文件。
