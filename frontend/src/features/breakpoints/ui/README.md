# breakpoints/ui

`breakpoints/ui/` 存放断点面板展示组件与样式。

## 当前 UI

- `BreakpointsPanelUI.tsx`：断点面板主体。左侧为按 origin（域名）分组的可折叠列表（复用 `components/host-group-list`，分组含已启用断点时箭头变绿，列表项带启用状态圆点），右侧为详情区；左右宽度可拖拽调整（`components/ui/resizable`）。头部操作区与 override 对齐，统一使用 `TooltipButton` + icon：新建（`FilePlusCorner`）、新增保存（`Save`，仅新建态显示）、启用/禁用（圆点动作语义，选中态显示）、删除（`Trash2`，选中态显示）。右侧详情仅保留信息展示，新增表单仅保留字段输入。左侧列表默认宽度与 traffic / override / saved 页面统一，复用 `lib/panelLayout.ts` 常量。
- `BreakpointsPanelUI.module.css`：列表项、详情区与新建表单样式。
- `BreakpointsPanelUI.overlay.module.css`：覆盖层与外层容器样式。

## 维护要求

新增或调整断点 UI 组件与样式时，必须同步更新本文件。
