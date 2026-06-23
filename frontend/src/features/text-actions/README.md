# text-actions

`text-actions/` 负责跨模块复用的文本右键动作，包括页面搜索、全局搜索、Decode/Format 弹窗和浏览器搜索；浏览器动作在选中内容为 URL（或带路径域名）时直接打开该地址，否则用默认搜索引擎查询，桌面端通过 `desktopHost.openExternalUrl` 调用系统浏览器。

## 子目录与文件

- `hooks/`：对外暴露文本动作 Hook。
- `ui/`：右键菜单与 Decode/Format 弹窗展示组件。
- `decodeFormat.ts`：自动识别 URL、URL component、base64、JWT 与 JSON 的纯转换函数；URL 参数值若仍是带参数 URL，会继续递归展开。
- `textActionsContext.tsx`：连接页面搜索、全局搜索与 Decode/Format 弹窗状态的 Provider。
- `textActionsContextValue.ts`：文本动作 Context 与读取 Hook。
- `texts.ts`：菜单和弹窗文案。

## 维护要求

新增文本动作、调整识别规则或改变弹窗状态边界时，必须同步更新本文件。
