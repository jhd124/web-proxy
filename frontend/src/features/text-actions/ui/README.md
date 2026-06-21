# text-actions/ui

`text-actions/ui/` 存放文本动作的纯展示组件与样式。

## 当前 UI

- `TextContextMenuUI.tsx`：基于现有 ContextMenu 封装统一文本右键菜单，右键时会缓存并恢复当前文本选区；优先使用选中文本，未选中时使用调用方提供的回退文本。
- `DecodeFormatDialogUI*`：Decode/Format 弹窗，展示识别类型、转换结果和复制结果按钮。

## 维护要求

新增或调整文本动作 UI 时，必须同步更新本文件。
