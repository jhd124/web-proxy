# panel-header

通用面板顶栏组件，统一 override、breakpoints、saved-requests 三个面板的 header 布局。

## 组件

### `PanelHeader`

| prop | 类型 | 说明 |
|---|---|---|
| `id` | `string` | 绑定 aria-labelledby 的 h2 id |
| `title` | `string` | 标题文字 |
| `subtitle` | `ReactNode?` | 副标题（小字，muted） |
| `actions` | `ReactNode?` | 右侧图标按钮区 |
| `onClose` | `() => void?` | 传入则渲染右侧关闭按钮 |
| `closeAriaLabel` | `string?` | 关闭按钮 aria-label，默认 `'Close'` |

### `panelHeaderStyles`（CSS module 默认导出）

提供 `.iconBtn` class，供各面板的 `TooltipButton`/按钮统一使用（2.2rem 方形图标按钮）。

## 使用方

- `features/override-editor/ui/OverrideEditorUI.tsx`
- `features/breakpoints/ui/BreakpointsPanelUI.tsx`
- `features/saved-requests/ui/SavedRequestsPanelUI.tsx`
