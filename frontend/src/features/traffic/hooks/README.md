# traffic/hooks

`traffic/hooks/` 管理流量模块的数据状态与交互状态。

## 当前 Hook

- `useTrafficState.ts`：流量列表摘要状态与操作集合（含 URL 关键词筛选与资源类型/方法/状态码/发起应用筛选，URL 匹配委托 `trafficFilter.ts` 的字面量匹配工具）；列表只常驻 `TrafficEntrySummary`，并维护 `entryById` 索引用于选中项和业务操作按 id 读取；选中条目后通过 `/api/requests/:id` 按需加载完整详情，详情加载完成前 `selected` 可短暂为空，UI 需以 `selectedId` 维持已展开的详情容器；会基于当前摘要实时去重生成“发起应用”筛选选项；`resumeRequest` 成功后会本地乐观清除对应条目的 `pending/breakpoint` 命中态，避免 UI 继续显示“等待放行”。

## 维护要求

新增 Hook 或调整状态管理职责时，必须同步更新本文件。
