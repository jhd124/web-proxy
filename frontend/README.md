# Frontend 项目说明

前端位于 `frontend/`，技术栈为 React + TypeScript + Vite，包管理器使用 Bun。

## README 索引

### 根目录与基础目录

- `public/README.md`
- `src/README.md`
- `src/theme/README.md`
- `src/components/README.md`
- `src/components/ui/README.md`
- `src/components/host-group-list/README.md`
- `src/hooks/README.md`
- `src/lib/README.md`
- `src/features/README.md`

### Feature 模块目录

- `src/features/dashboard/README.md`
- `src/features/dashboard/hooks/README.md`
- `src/features/dashboard/ui/README.md`
- `src/features/advanced-search/README.md`
- `src/features/advanced-search/hooks/README.md`
- `src/features/advanced-search/ui/README.md`
- `src/features/traffic/README.md`
- `src/features/traffic/hooks/README.md`
- `src/features/traffic/ui/README.md`
- `src/features/floating-traffic/README.md`
- `src/features/floating-traffic/hooks/README.md`
- `src/features/floating-traffic/ui/README.md`
- `src/features/page-search/README.md`
- `src/features/page-search/hooks/README.md`
- `src/features/page-search/ui/README.md`
- `src/features/breakpoints/README.md`
- `src/features/breakpoints/hooks/README.md`
- `src/features/breakpoints/ui/README.md`
- `src/features/override-editor/README.md`
- `src/features/override-editor/hooks/README.md`
- `src/features/override-editor/ui/README.md`
- `src/features/saved-requests/README.md`
- `src/features/saved-requests/hooks/README.md`
- `src/features/saved-requests/ui/README.md`

## 当前目录快照（简版）

- `public/`：静态资源。
- `src/`：前端源码主目录。
- `src/theme/`：主题与设计令牌。
- `src/components/ui/`：通用基础组件。
- `src/components/host-group-list/`：按域名分组的可折叠列表组件。
- `src/hooks/`：共享 Hook。
- `src/lib/`：工具函数与基础封装。
- `src/features/`：业务模块集合。

## 常用命令

- `bun install`：安装依赖。
- `bun run dev`：启动开发环境。
- `bun run build`：执行类型检查并打包。
- `bun run lint`：执行代码检查。
- `bun run test`：启动测试（watch）。
- `bun run test:run`：一次性运行测试。

## 维护约定（必须遵守）

当你修改任一目录下代码时，必须同步更新该目录的 `README.md`（至少包含职责、关键文件或子目录说明变化）。  
若涉及目录新增、删除、重命名，或 README 路径变动，还必须同步更新本文件中的 README 索引。
