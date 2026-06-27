# Backend 项目说明

后端位于 `backend/`，Rust crate 名称为 `proxy-app`，负责代理核心能力与 Dashboard API。

## README 索引

- `src/README.md`
- `src/system_proxy/README.md`
- `src/system_proxy/network/README.md`

## 目录结构（简版）

- `Cargo.toml`：crate 元数据与依赖配置。
- `src/`：后端核心实现与测试文件。

## 运行与测试

- `cargo build -p proxy-app`：构建后端。
- `cargo run -p proxy-app`：本地运行后端。
- `cargo test -p proxy-app`：运行后端测试。

## 常用环境变量

- `PROXY_PORT`：代理端口（默认 `9090`）。
- `DASHBOARD_PORT`：Dashboard 端口（默认 `9091`）。
- `PROXY_DATA_DIR`：数据目录（SQLite、证书等）。
- `OVERRIDE_DB`：覆盖规则数据库路径。
- hosts 托管配置保存为 `OVERRIDE_DB` 同目录下的 `proxy-hosts.json`；配置文件缺失时会从系统 hosts 中的 `proxy-app` 标记区块恢复，系统 hosts 写入只替换该标记区块；直接写入无权限时后端会尝试触发系统授权。
- `MAX_TRAFFIC`：内存中保留的抓包条目上限。
- 请求编写器模板索引与历史记录存放在 `OVERRIDE_DB` 指向的 SQLite 文件中，并由后端按固定上限裁剪。
- `MITM`：是否启用 HTTPS MITM（`1/true` 启用）。
- `MITM_CA_DIR`：MITM CA 存储目录。
- `UPSTREAM_HTTP3`：是否启用上游 HTTP/3 客户端。
- `PROXY_AUTO_SYSTEM_PROXY`：启动后是否自动打开系统 HTTP/HTTPS 代理（`1/true` 启用，桌面 sidecar 与本地开发启动目标使用）。

## 维护约定（必须遵守）

当你修改 `backend/` 下目录结构、模块职责、关键文件用途或运行方式时，必须同步更新对应目录的 `README.md`；若 README 路径发生变化，必须同步更新本文件索引。
