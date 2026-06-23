# override-editor/ui

`override-editor/ui/` 存放覆盖编辑模块的展示层组件与样式。

## 当前 UI

- `OverrideEditorUI*`：编辑器容器，支持在编辑器打开时使用 `Cmd/Ctrl + S` 触发保存；头部右侧始终展示 `SquarePlus` 图标的新建按钮（无文字），点击后清空当前选中规则、收起中间响应体编辑区为空状态，并展开右侧空表单。新建按钮旁常驻 `Ellipsis` 更多操作按钮，hover 时展示 popover menu，提供一个“全部开启/全部禁用”的批量 toggle 选项（按当前全量状态决定动作）。保存按钮（无文字）在“已选中规则”或“正在编辑新建 override”时显示，其余场景隐藏；显示时仅在存在未保存改动时使用蓝色主按钮样式，并保持固定按钮尺寸（避免状态切换导致大小变化）；`Add breakpoint` 按钮使用 `StepForward` 图标（无文字，仅 tooltip/aria-label）；规则启停按钮复用 `RuleEnabledToggleButton`，使用动作语义圆点（红=Disable，绿=Enable），点击后会连同当前表单一起自动保存；`Delete rule` 按钮使用 `Trash2` 图标（无文字，仅 tooltip/aria-label）；头部操作按钮统一提供 tooltip。中间编辑区仅在“已选中规则”或“正在编辑新建 override”时渲染响应体编辑器，未选中任何 override 时展示空状态提示（引导从列表选择或新建规则）。左侧列表默认宽度与 traffic / breakpoints / saved 页面统一，复用 `lib/panelLayout.ts` 常量。
- `OverrideMonacoUI.tsx`：Monaco 编辑器视图，主题通过 `usePrefersDark` 跟随系统配色在 `vs`（浅色）/`vs-dark`（深色）间切换；通过 Monaco `addAction` 在原生右键菜单中追加搜索、全局搜索、Decode/Format、用浏览器搜索动作，并保留 Monaco 现有菜单项。
- `OverrideFilesUI*`：文件树视图（包含规则列表，不再展示顶部导入说明段落与新建规则按钮）；采用简约现代样式：主机分组为轻量可悬浮标题行 + 计数胶囊（分组内含已启用 override 时，标题箭头变绿），规则项为带状态圆点（绿=启用，灰=禁用）的紧凑行，并以左侧竖线表达层级；当前编辑中的规则项会展示选中态，新建 override 时列表不展示选中态。
- `OverrideRequestFormUI*`：请求匹配表单（移除顶部 Override id 区块与“Enable this override rule”开关行，`Method` 与 `Protocol` 使用 shadcn `Select` 下拉选择或 `ANY`，其中新建 override 的默认 `Method` 为 `GET`）。各字段的说明文字不再内联展示，而是收进 label 后的 `<CircleQuestionMark />` 图标 tooltip 中。
- `LabelHint.tsx`：字段说明小图标（`<CircleQuestionMark />` + shadcn tooltip），用于把字段说明文字放进 hover 提示。
- `OverrideBodyEditorUI*`：响应体编辑区，顶部提示行展示当前规则匹配 URL（protocol://host/path），无 host 时回退为提示文案。
- `OverrideBodyImageUI*`：图片响应体视图。
- `RuleBulkActionsMenu*`：规则批量启停菜单，常驻 `Ellipsis` 触发按钮，hover/focus 时打开 popover，内部单个 toggle 项按当前全量启用状态切换全部规则。
- `RuleEnabledToggleButton*`：规则启用/禁用头部按钮，复用 override 的圆点动作语义样式，并供 breakpoints 面板复用。
- `TooltipButton.tsx`：头部操作按钮统一 Tooltip 封装（基于 shadcn/radix tooltip）。

## 维护要求

新增、删除或重构覆盖编辑 UI 组件时，必须同步更新本文件。
