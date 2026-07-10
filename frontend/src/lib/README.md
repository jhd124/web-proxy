# lib

`lib/` 存放无 UI 依赖的工具函数与基础能力封装。

## 能力范围

- 交互辅助：`toast`、`confirm`、`clipboard`、`download`。
- 环境与窗口：`desktopHost`（含 Electron 标题栏代理地址同步）、`focusMainWindow`、`useMainWindowTrafficSelect`。
- 业务工具：`billingError`（解析后端配额超限错误）、`curl`、`har`（HAR 导出 creator 使用 LeoProxy）、`overrideMatch`（前端本地 override 命中预判与 `pickBestMatchingOverride` 最具体规则选取，host/path 与 request header/query value 支持 `*`、`?` 通配符）、`overrideIdentity`、`dashboardUtils`（含 `trafficEntryOrigin`，用于从抓包条目稳定提取 origin；`getDefaultOverrideForm()` 默认 `matchMethod=GET`）、`panelLayout`（跨模块统一 panel 布局常量）。
- 通用工具：`utils`。

## 维护要求

新增工具模块、移动文件或调整职责边界时，必须同步更新本文件。
