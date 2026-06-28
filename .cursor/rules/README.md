# LeoProxy - Cursor Rules

本目录用于维护仓库的 Cursor 规则（`.mdc`）。

## 规则清单

| 文件 | 说明 | 生效范围 |
| --- | --- | --- |
| [`code-style.mdc`](./code-style.mdc) | 通用代码风格、命名、文件结构约束 | `alwaysApply: true` |
| [`project.mdc`](./project.mdc) | 项目级约定（后端职责、前端技术栈、桌面端运行方式） | `alwaysApply: true` |
| [`react.mdc`](./react.mdc) | React 组件/Hook 规范与职责分离模式 | `alwaysApply: true`，`*.ts,*.tsx` |
| [`style.mdc`](./style.mdc) | CSS/样式编写规范 | `*.scss,*.less,*.css,*.tsx` |
| [`backend-api-test-requirement.mdc`](./backend-api-test-requirement.mdc) | 后端接口变更必须同步新增/更新测试 | `backend/src/**/*.rs` |
| [`agent-doc-sync.mdc`](./agent-doc-sync.mdc) | 代码变更后同步维护模块文档（`docs/agent-reference/*`） | 目录级约束（`backend/`、`frontend/`、`desktop/`、`mcp/`） |
| [`type-safety.mdc`](./type-safety.mdc) | 类型安全与包边界规范（历史跨仓规则，当前仓库一般不直接触发） | `bohrium-domains` / `bohrium-next-app` 相关路径 |

## 维护约定

- 新增规则时，优先做到“一条规则只解决一个问题”。
- 尽量在 frontmatter 写清楚 `description`、`globs`、`alwaysApply`。
- 新增/调整规则后，记得同步更新本 README 的规则清单。
