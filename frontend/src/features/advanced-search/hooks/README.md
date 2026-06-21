# advanced-search/hooks

`advanced-search/hooks/` 管理全局搜索的状态与副作用。

## 当前 Hook

- `useAdvancedSearch.ts`：维护面板开关、最小化状态、查询词、已提交查询词、loading/error、分组结果和目标打开器注册；`Cmd+Shift+F` 或文本右键菜单可打开全局搜索并隐藏 `Cmd+F` 小搜索框，按 `Cmd+F` 时隐藏全局搜索面板；点击搜索按钮、按 Enter 或带 `submit` 选项打开时请求 `/api/search`，并用 `AbortController` 取消过期请求，避免卸载或重复提交后的旧结果写回。

## 维护要求

新增 Hook 或调整搜索副作用时，必须同步更新本文件。
