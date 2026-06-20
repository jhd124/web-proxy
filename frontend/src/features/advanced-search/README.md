# advanced-search

`advanced-search/` 提供应用级高级文本搜索能力。它通过全局 Provider/Portal 管理搜索状态与底部结果面板，可由 `Cmd+F` 页面搜索框入口或 `Cmd+Shift+F` 直接打开，并和 `Cmd+F` 小搜索框互斥显示；支持最小化为右下角悬浮按钮；关闭高级搜索后若仍有关键词，会恢复显示小搜索框；搜索 traffic、override、breakpoint、saved 四类数据；提交搜索时同步更新页面搜索关键词以高亮页面内容，并把结果点击交给当前视图注册的打开器处理。

## 子目录与文件

- `hooks/`：高级搜索状态、副作用和后端请求逻辑。
- `ui/`：底部可调高度结果面板、分组结果列表与高亮展示。
- `advancedSearchContext.tsx`：全局 `AdvancedSearchProvider` 与 `useAdvancedSearchContext`。
- `portal.tsx`：把全局搜索面板挂到应用根部。
- `texts.ts`、`types.ts`：文案与类型定义。

## 维护要求

调整高级搜索状态边界、入口能力或结果跳转协议时，必须同步更新本文件。
