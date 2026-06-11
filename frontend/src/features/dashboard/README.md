# dashboard

`dashboard/` 负责主工作台页面结构、导航区域与全局状态协调。

## 子目录与文件

- `ui/`：工作台 UI 组件（Header/Sidebar/主容器）。
- `hooks/`：工作台状态与 WebSocket 连接逻辑。
- `portal.tsx`：模块组装入口。
- `texts.ts`：模块文案。

## 维护要求

调整 dashboard 目录结构或职责分层时，必须同步更新本文件。
