# breakpoints

`breakpoints/` 负责断点列表管理与断点面板交互。

## 子目录与文件

- `ui/`：断点面板 UI 与样式（左侧按域名分组列表 + 右侧统一可编辑表单，宽度可调，支持 `Cmd/Ctrl + S` 保存）。
- `hooks/`：断点状态逻辑（含选中项、新建状态与统一保存流程：新建/更新）。
- `breakpointGroups.ts`：按 origin（域名）对断点规则分组的纯函数。
- `portal.tsx`：模块组装入口。
- `texts.ts`、`types.ts`：文案与类型定义。

## 维护要求

调整 breakpoints 模块结构或职责时，必须同步更新本文件。
