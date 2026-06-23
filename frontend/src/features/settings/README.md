# settings

`settings/` 提供应用设置页，入口位于侧边栏底部（`<Settings />` 图标），当前包含外观（深/浅 UI）切换，以及请求编写器历史模板的敏感 header 持久化开关。

## 子目录与文件

- `ui/`：设置页纯展示组件（外观切换分段控件、请求编写器历史模板开关）。
- `portal.tsx`：组装入口，使用共享 `useTheme` Hook 注入主题偏好与设置回调，并接入 request catalog settings API。
- `texts.ts`：模块文案（键值集中管理）。

## 说明

- 主题逻辑收敛在共享层：`src/theme/themeController.ts`（偏好持久化与 `data-theme` 写入）+ `src/hooks/useTheme.ts`（React 封装）。
- 请求编写器历史模板默认不保存敏感 headers，用户可在设置页开启。
- 设置页作为 dashboard 的一个 tab（`activeTab === 'settings'`）渲染，导航通过 `useDashboard.openSettingsPanel` 触发。

## 维护要求

调整设置项、目录结构或主题接入方式时，必须同步更新本文件。
