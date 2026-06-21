# theme

`theme/` 管理全局视觉令牌与主题样式映射。

## 当前内容

- `token.css`：设计令牌定义（颜色、间距、圆角等），由 `<html data-theme="light|dark">` 控制：浅色取值在 `:root, :root[data-theme='light']`，深色取值在 `:root[data-theme='dark']`。`data-theme` 由 `index.html` 内联脚本在首帧前写入、由 `hooks/useTheme` 运行时维护，因此切换不再依赖 `prefers-color-scheme` 媒体查询。其中 `--search-highlight-background` / `--search-highlight-foreground` 统一页面检索与关键词命中的高亮颜色；`--surface-panel` / `--surface-inset` / `--surface-selected` / `--surface-floating` 为面板、列表、输入框、悬浮卡片等表面分层提供主题感知背景（traffic / override / saved / breakpoints / settings 等列表与详情统一引用，避免硬编码深色）。
- `theme.css`：主题层变量与样式映射。
- `themeController.ts`：主题偏好控制（偏好读写持久化、系统配色解析、写入 `<html data-theme>`、订阅系统配色变化），不依赖 React，供 `hooks/useTheme` 与首帧脚本之外的场景复用。

## 维护要求

新增/变更主题变量、令牌或主题样式时，必须同步更新本文件。
