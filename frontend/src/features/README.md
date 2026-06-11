# features

`features/` 按业务域组织前端功能模块。

## 当前模块

- `dashboard/`：主工作台与全局布局编排。
- `traffic/`：流量列表展示与交互。
- `floating-traffic/`：悬浮流量详情视图。
- `breakpoints/`：断点管理。
- `override-editor/`：请求/响应覆盖编辑。
- `saved-requests/`：已保存请求管理。

## 模块约定

每个模块按职责拆分为 `portal.tsx`、`hooks/`、`ui/`、`texts.ts`、`types.ts`（按实际需要取舍）。

## 维护要求

新增、删除或重命名业务模块时，必须同步更新本文件。
