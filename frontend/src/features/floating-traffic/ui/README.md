# floating-traffic/ui

`floating-traffic/ui/` 存放悬浮流量详情展示组件与样式。

## 当前 UI

- `FloatingTrafficUI*`：悬浮容器。现代简约风格，吸顶毛玻璃头部（`backdrop-filter` 半透明模糊）+ 柔和渐变底，搜索区为玻璃药丸容器，标签为圆角药丸；列表接收轻量流量摘要。
- `FloatingTrafficDetailPanelUI*`：详情侧板。半透明玻璃卡片，代码块统一使用主题 token 渲染（适配明暗主题）；仅渲染选中后按需加载的完整请求详情。
- `FloatingTrafficDetailDrawerUI.tsx`：详情抽屉。

## 样式约定

- 半透明表面统一通过 `color-mix(in srgb, <token> N%, transparent)` 基于主题 token 派生，禁止硬编码颜色。
- 毛玻璃效果需同时声明 `-webkit-backdrop-filter` 与 `backdrop-filter`（前者在前）。

## 维护要求

新增或调整悬浮详情 UI 组件时，必须同步更新本文件。
