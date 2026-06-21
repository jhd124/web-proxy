# hooks

`hooks/` 存放跨业务共享的自定义 Hook。

## 当前内容

- `use-mobile.ts`：设备/视口相关状态判断 Hook。
- `useTheme.ts`：全局主题偏好 Hook，封装 `theme/themeController`，返回 `preference`（跟随系统/浅/深）、解析后的 `mode` 与 `setPreference`，并写入 `<html data-theme>`、持久化、跟随系统配色变化；供设置页与 Monaco 等按主题切换的场景使用。

## 维护要求

新增共享 Hook 或调整 Hook 适用范围时，必须同步更新本文件。
