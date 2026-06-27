# hosts

`hosts/` 提供系统 hosts 文件托管页面。页面只管理 `proxy-app` 标记区块，避免覆盖系统原有 hosts 内容。

## 子目录与文件

- `apis.ts`：封装 `/api/hosts*` 配置保存、系统应用与系统移除请求。
- `hooks/`：业务 Hook，负责加载配置、编辑条目、保存、应用到系统与移除系统托管区块。
- `ui/`：Hosts 页面纯展示组件与 CSS Modules。
- `portal.tsx`：组装 Hook 与 UI，供 Dashboard tab 渲染。
- `texts.ts`：模块文案。

## 维护要求

调整 hosts API、页面结构、后端写入流程或目录结构时，必须同步更新本文件。
