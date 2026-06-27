# hosts/hooks

`hooks/` 承载 hosts 管理业务逻辑。

## 文件说明

- `useHostsManager.ts`：加载 `/api/hosts` 状态，维护本地编辑列表，保存配置，并通过后端 `/api/hosts/apply` 与 `/api/hosts/revert` 统一读写系统 hosts 文件。

## 维护要求

调整 hosts 状态流转、保存/应用策略或后端 API 契约时，必须同步更新本文件。
