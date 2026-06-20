# src

`src/` 是前端业务代码主目录，负责应用入口、主题、通用能力与各业务模块。

## 子目录

- `theme/`：主题与设计令牌样式。
- `components/`：可复用 UI 组件。
- `hooks/`：跨业务复用 Hook。
- `lib/`：工具函数与基础封装。
- `features/`：按业务域拆分的功能模块。

## 关键文件

- `main.tsx`：应用挂载入口。
- `App.tsx`：应用根组件，挂载主视图、全局高级搜索、悬浮页面检索、确认弹窗与 toast host。
- `index.css`：全局样式。
- `types.ts`：共享类型；流量列表使用 `TrafficEntrySummary` 摘要，完整 `TrafficEntry` 仅在详情、保存、导出等按需场景使用。

## 维护要求

调整 `src/` 下的目录结构、入口文件或职责边界时，必须同步更新本文件。
