# breakpoints

`breakpoints/` 负责断点列表管理与断点面板交互。

## 子目录与文件

- `ui/`：断点面板 UI 与样式（左侧按域名分组列表 + 右侧详情/新建表单，宽度可调）。
- `hooks/`：断点状态逻辑（含选中项与新建状态）。
- `breakpointGroups.ts`：按 origin（域名）对断点规则分组的纯函数。
- `portal.tsx`：模块组装入口。
- `texts.ts`、`types.ts`：文案与类型定义。

## 维护要求

调整 breakpoints 模块结构或职责时，必须同步更新本文件。
