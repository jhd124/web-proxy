# request-composer/hooks

`hooks/` 存放请求编写器的业务状态与后端 API 接入逻辑。

## 当前内容

- `useRequestComposer.ts`：维护 URL + method 请求表单、host/path/method 自动补全（host 支持 `baidu` → `www.baidu.com` 的扩展匹配）、模板回填、cURL 导入解析、发送状态、响应展示和历史记录列表/详情操作；发送前会把 URL 解析为后端需要的 scheme/host/path；历史项右键动作会按需加载详情，并交给 dashboard 注入的保存请求/创建 override 回调处理。

## 维护要求

新增或调整请求编写器业务逻辑时，必须同步更新本文件。
