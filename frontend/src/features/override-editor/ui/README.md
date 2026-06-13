# override-editor/ui

`override-editor/ui/` 存放覆盖编辑模块的展示层组件与样式。

## 当前 UI

- `OverrideEditorUI*`：编辑器容器，支持在编辑器打开时使用 `Cmd/Ctrl + S` 触发保存；头部右侧始终展示 `SquarePlus` 图标的新建按钮（无文字）。保存按钮（无文字）在“已选中规则”或“正在编辑新建 override”时显示，其余场景隐藏；显示时仅在存在未保存改动时使用蓝色主按钮样式，并保持固定按钮尺寸（避免状态切换导致大小变化）。
- `OverrideMonacoUI.tsx`：Monaco 编辑器视图。
- `OverrideFilesUI*`：文件树视图（包含规则列表，不再展示顶部导入说明段落与新建规则按钮）。
- `OverrideRequestFormUI*`：请求匹配表单（移除顶部 Override id 区块与“Enable this override rule”开关行，`Method` 使用 shadcn `Select` 下拉选择常见 HTTP 方法或 `ANY`）。
- `OverrideBodyEditorUI*`：响应体编辑区，顶部提示行展示当前规则匹配 URL（protocol://host/path），无 host 时回退为提示文案。
- `OverrideBodyImageUI*`：图片响应体视图。

## 维护要求

新增、删除或重构覆盖编辑 UI 组件时，必须同步更新本文件。
