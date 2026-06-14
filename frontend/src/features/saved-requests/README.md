# saved-requests

`saved-requests/` 负责已保存请求的展示、选择与管理逻辑。

## 子目录与文件

- `ui/`：已保存请求面板 UI（左侧按域名分组列表 + 右侧详情，宽度可调）。
- `hooks/`：已保存请求状态逻辑。
- `savedRequestGroups.ts`：按域名（host）对已保存请求分组的纯函数。
- `portal.tsx`：模块组装入口。
- `texts.ts`、`types.ts`：文案与类型定义。

## 维护要求

调整 saved-requests 模块结构或职责时，必须同步更新本文件。
