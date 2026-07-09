# request-composer

`request-composer/` 提供请求编写器页面，用于编写、发送、查看历史并复用 HTTP/HTTPS API 请求。

## 子目录与文件

- `portal.tsx`：模块组装入口，连接请求编写器 Hook 与纯 UI，并接收 dashboard 注入的外部请求预填、历史请求保存/创建 override 动作。
- `hooks/`：请求编写器状态、自动补全、模板回填、发送请求与历史记录加载逻辑。
- `ui/`：请求编写器页面展示组件与样式。
- `texts.ts`：模块文案。
- `types.ts`：Hook 与 UI 之间的视图模型类型。

## 说明

- URL 字段合并原 scheme/hostname/path，hostname/path/method 补全来自后端 request catalog。
- 发送请求与导入 cURL 入口位于页面标题栏右侧，以图标按钮形式展示；导入 cURL 弹窗会解析粘贴的 curl 命令并回填 URL、method、search params、headers 与 body。
- 历史列表只展示通过请求编写器发送过的请求；选择历史记录后可查看响应摘要并复用到表单，`Reuse` 会回填 URL、method、search params、headers 与 body；历史项右键菜单可保存请求或用该响应创建 override；saved requests 可从列表右键菜单进入本页面并预填请求表单。
- search params 与 headers 在表单中使用 `key=value` 的多行文本格式；search params、body 与 headers 输入框支持文本右键菜单（搜索、全局搜索、Decode/Format、用浏览器搜索）。
- 右侧历史区与响应区仅在存在历史记录时显示，并支持上下拖拽调整高度，便于在不同数据量下聚焦查看。

## 维护要求

调整请求编写器的目录结构、接口接入或交互职责时，必须同步更新本文件。
