# override-editor

`override-editor/` 负责请求/响应覆盖规则编辑、文件树与内容处理能力。

## 子目录与文件

- `ui/`：编辑器、表单、文件树等 UI 组件。
- `hooks/`：覆盖编辑状态与编辑器行为逻辑。
- `portal.tsx`：模块组装入口。
- `texts.ts`、`types.ts`：文案与类型定义。
- `override*.ts`：覆盖规则相关纯函数。
- `*.test.ts`：覆盖规则工具测试。

## 匹配能力说明

- 请求匹配中的 host、path 以及 request headers / query 的 value 支持通配符 `*`、`?`。
- 响应头值为 `*` 时，用同名请求头回填（无同名头则保留字面量 `*`，例如 CORS）；map remote 时规则响应头会按同名覆盖上游响应头。

## 维护要求

调整 override-editor 模块结构、工具函数或交互职责时，必须同步更新本文件。
