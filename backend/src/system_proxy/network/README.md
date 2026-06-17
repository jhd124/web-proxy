# system_proxy/network

`network/` 封装不同操作系统的系统 HTTP/HTTPS 代理读写细节。

## 子目录与文件

- `mod.rs`：平台分发入口与恢复快照类型定义。
- `macos.rs`：macOS `networksetup` 实现，负责读取启用网络服务、保存代理快照、设置本机代理与恢复原状态。

## 维护要求

新增平台实现或修改快照结构时，必须同步更新本文件，并确保上层 `system_proxy` 仍能在关闭与进程退出时恢复代理状态。
