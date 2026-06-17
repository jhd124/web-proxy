# breakpoints/ui

`breakpoints/ui/` 存放断点面板展示组件与样式。

## 当前 UI

- `BreakpointsPanelUI.tsx`：断点面板主体。左侧为按 origin（域名）分组的可折叠列表（复用 `components/host-group-list`，分组含已启用断点时箭头变绿；若分组内存在命中且等待放行的请求则箭头变红。列表项默认带启用状态圆点，命中等待放行时圆点变红，且条目最右展示绿色 `StepForward` 继续按钮）。右侧按状态展示：未选择且未进入新建态时显示空状态提示；新建态或选中已有规则时显示可编辑表单（`Method` 字段为下拉选择，含 `ANY/GET/POST/...`；路径字段改为字符串精确匹配，不再按正则解释）；左右宽度可拖拽调整（`components/ui/resizable`）。头部操作区与 override 对齐，统一使用 `TooltipButton` + icon：新建（`FilePlusCorner`）、更多操作（常驻 `Ellipsis`，hover 时展示 popover menu，提供按当前全量状态切换的“全部开启/全部禁用”选项）、保存（`Save`，新建=创建、选中=更新；仅在表单有未保存改动时高亮为主按钮，且仅在新建态/选中态可点击）、继续放行（选中规则且存在 pending 请求时显示绿色 `StepForward`）、启用/禁用（复用 override 的 `RuleEnabledToggleButton` 圆点动作语义样式，选中态显示）、删除（`Trash2`，选中态显示）。面板打开时支持 `Cmd/Ctrl + S` 触发表单保存。左侧列表默认宽度与 traffic / override / saved 页面统一，复用 `lib/panelLayout.ts` 常量。
- `BreakpointsPanelUI.module.css`：列表项、详情区与新建表单样式。
- `BreakpointsPanelUI.overlay.module.css`：覆盖层与外层容器样式。

## 维护要求

新增或调整断点 UI 组件与样式时，必须同步更新本文件。
