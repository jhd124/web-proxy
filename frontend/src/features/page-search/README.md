# page-search

`page-search/` 提供通过 `Cmd+F` 唤起的当前页面内容浮动文字检索能力，并在搜索框中提供应用级高级搜索入口；页面高亮可在小搜索框隐藏时继续由高级搜索关键词驱动。

## 子目录与文件

- `hooks/`：页面检索显隐、输入状态、DOM 文本范围收集、结果跳转与高亮生命周期。
- `ui/`：右下角浮动搜索框、高级搜索入口、前后结果跳转按钮、关闭按钮和匹配数量展示。
- `portal.tsx`：模块组装入口。
- `texts.ts`：模块文案。
- `pageSearchContext.tsx`：跨模块共享页面检索状态，供 traffic 等虚拟渲染区域复用关键词并注册可跳转结果源。
- `pageSearchHighlight.ts`：CSS Custom Highlight API 适配与文本 Range 收集工具，高亮颜色使用全局搜索高亮 token。
- `pageSearchNavigation.ts`：普通 DOM 结果与虚拟结果源之间的跳转、计数和滚动工具。

## 维护要求

调整页面检索的目录结构、职责分层或挂载方式时，必须同步更新本文件。
