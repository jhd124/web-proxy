# request-composer/ui

`ui/` 存放请求编写器的纯展示组件与样式。

## 当前内容

- `RequestComposerUI.tsx`：请求编写器页面，标题区展示标题与发送请求图标按钮；左侧为 URL、request、headers 三段连续表单（组间细分隔线、无组标题，`GET` 方法下隐藏 Body 输入）。右侧历史与响应区仅在存在历史记录时显示，并保留章节标题与操作区；中间新增可拖拽分栏手柄，可实时调节右侧 history/response 面板宽度。历史列表主行展示 `Method + 完整 URL`（不再只显示 path），并在文本截断时可通过 hover title 查看完整内容；历史项右键菜单提供保存请求与创建 override。
- `CurlImportDialogUI.tsx`：cURL 导入弹窗，接收用户粘贴的 curl 命令并在确认后交给 hook 解析回填表单。
- `RequestComposerUI.module.css`：页面分栏、表单分隔线、历史列表、响应预览与表单样式；多行输入框按内容自动增高并在宽度变化时重新计算高度；右侧历史区与响应区支持上下拖拽调整高度，响应区仅保留 Reuse 操作。
- `CurlImportDialogUI.module.css`：cURL 导入弹窗布局、输入框与按钮区样式。

## 维护要求

新增或调整请求编写器 UI 组件时，必须同步更新本文件。
