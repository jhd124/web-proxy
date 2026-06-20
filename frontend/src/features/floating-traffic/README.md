# floating-traffic

`floating-traffic/` 负责悬浮流量详情视图（面板/抽屉）及其状态协调，复用 traffic 搜索关键词并在列表与详情里高亮命中内容，同时为应用级高级搜索结果提供主窗口聚焦适配。

## 子目录与文件

- `ui/`：悬浮详情相关 UI 组件。
- `hooks/`：悬浮详情状态逻辑。
- `portal.tsx`：模块组装入口。
- `texts.ts`、`types.ts`：文案与类型定义。

## 维护要求

调整 floating-traffic 结构或视图职责时，必须同步更新本文件。
