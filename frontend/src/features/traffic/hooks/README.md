# traffic/hooks

`traffic/hooks/` 管理流量模块的数据状态与交互状态。

## 当前 Hook

- `useTrafficState.ts`：流量列表状态与操作集合（含关键词筛选与资源类型/方法/状态码/发起应用筛选）；会基于当前流量实时去重生成“发起应用”筛选选项；`resumeRequest` 成功后会本地乐观清除对应条目的 `pending/breakpoint` 命中态，避免 UI 继续显示“等待放行”。

## 维护要求

新增 Hook 或调整状态管理职责时，必须同步更新本文件。
