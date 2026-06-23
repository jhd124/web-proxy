# request-composer

`request-composer/` 提供请求编写器页面，用于编写、发送、查看历史并复用 HTTP/HTTPS API 请求。

## 子目录与文件

- `portal.tsx`：模块组装入口，连接请求编写器 Hook 与纯 UI。
- `hooks/`：请求编写器状态、自动补全、模板回填、发送请求与历史记录加载逻辑。
- `ui/`：请求编写器页面展示组件与样式。
- `texts.ts`：模块文案。
- `types.ts`：Hook 与 UI 之间的视图模型类型。

## 说明

- URL 字段合并原 scheme/hostname/path，hostname/path/method 补全来自后端 request catalog。
- 发送请求入口位于页面标题栏右侧，以图标按钮形式展示。
- 历史列表只展示通过请求编写器发送过的请求；选择历史记录后可查看响应摘要并复用到表单。
- search params 与 headers 在表单中使用 `key=value` 的多行文本格式。

## 维护要求

调整请求编写器的目录结构、接口接入或交互职责时，必须同步更新本文件。
