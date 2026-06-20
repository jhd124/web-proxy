# advanced-search/hooks

`advanced-search/hooks/` 管理高级搜索的全局状态与副作用。

## 当前 Hook

- `useAdvancedSearch.ts`：维护面板开关、最小化状态、查询词、已提交查询词、loading/error、分组结果和目标打开器注册；`Cmd+Shift+F` 直接打开高级搜索并隐藏 `Cmd+F` 小搜索框，按 `Cmd+F` 时隐藏高级搜索面板；只有点击搜索按钮或按 Enter 时才请求 `/api/search`，并用 `AbortController` 取消过期请求，避免卸载或重复提交后的旧结果写回。

## 维护要求

新增 Hook 或调整搜索副作用时，必须同步更新本文件。
