# settings/ui

`ui/` 存放设置页的纯展示组件，不含业务逻辑。

## 当前内容

- `SettingsPanelUI.tsx`：设置页容器，外观区域提供「跟随系统 / 浅色 / 深色」分段切换控件，通过 `setPreference` 回调上抛选择；请求编写器历史模板区域提供敏感 header 持久化开关。
- `SettingsPanelUI.module.css`：设置页样式（分段控件、分区布局），颜色统一引用主题令牌。

## 维护要求

新增或调整设置项 UI 时，必须同步更新本文件。
