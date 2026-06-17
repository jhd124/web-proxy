# traffic

`traffic/` 负责流量列表数据展示、列表渲染策略与交互状态管理。

## 子目录与文件

- `ui/`：流量面板与虚拟列表 UI。
- `hooks/`：流量状态管理。
- `portal.tsx`：模块组装入口。
- `texts.ts`、`types.ts`：文案与类型定义。
- `trafficDisplay.ts`、`trafficEntriesLimit.ts`：展示规则与数量控制。
- `trafficFilter.ts`：URL 关键词解析与资源类型/方法/状态码/发起应用的归类及筛选匹配逻辑（URL 关键词按字面量匹配，兼容包含 `.` 的域名、后缀与编码路径）。
- `trafficFilter.test.ts`：URL 关键词与筛选匹配的回归测试。

## 维护要求

调整 traffic 模块结构或展示策略时，必须同步更新本文件。
