# components/host-group-list

`host-group-list/` 提供以域名（host/origin）分组的可折叠列表通用组件，供需要「左侧按域名分组列表 + 右侧详情」布局的面板复用（如 saved-requests、breakpoints、override-editor 风格）。

## 当前组件

- `HostGroupList.tsx`：泛型展示组件。接收已分组数据 `groups`（`{ host, items }[]`），通过 `renderItem` 渲染每个条目，`getItemKey` 提供 key；可选 `isGroupActive` 控制分组箭头是否高亮（绿色），`isGroupAlert` 控制分组箭头告警高亮（红色，优先级高于 `isGroupActive`），`toggleLabel` 提供折叠按钮无障碍文案，`idPrefix` 用于生成稳定 DOM id。
- `HostGroupList.module.css`：分组标题行、计数胶囊、层级竖线与折叠箭头样式（与 override 文件树风格一致）。

## 维护要求

调整分组列表结构、样式或 props 时，必须同步更新本文件。
