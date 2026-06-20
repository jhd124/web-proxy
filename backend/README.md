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
- `MAX_TRAFFIC`：内存中保留的抓包条目上限。
- `MITM`：是否启用 HTTPS MITM（`1/true` 启用）。
- `MITM_CA_DIR`：MITM CA 存储目录。
- `UPSTREAM_HTTP3`：是否启用上游 HTTP/3 客户端。
- `PROXY_AUTO_SYSTEM_PROXY`：启动后是否自动打开系统 HTTP/HTTPS 代理（`1/true` 启用，桌面 sidecar 与本地开发启动目标使用）。

## 维护约定（必须遵守）

当你修改 `backend/` 下目录结构、模块职责、关键文件用途或运行方式时，必须同步更新对应目录的 `README.md`；若 README 路径发生变化，必须同步更新本文件索引。
