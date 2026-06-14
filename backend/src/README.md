# backend/src

`src/` 是后端核心代码目录，包含代理服务、Dashboard API、状态管理与各业务子模块。

## 模块文件说明

- `main.rs`：进程入口，负责加载配置、初始化状态、启动 proxy 与 dashboard 服务。
- `api.rs`：Dashboard HTTP/WebSocket 路由与 handler，提供健康检查、抓包查询、操作命令等接口。
- `proxy.rs`：HTTP/HTTPS 代理主流程，包含转发、抓包记录、MITM 处理与流式响应处理。
- `state.rs`：全局应用状态定义与状态读写接口。
- `ports.rs`：端口解析与默认端口策略。
- `mitm.rs`：MITM 证书与 TLS 相关能力。
- `overrides.rs`：覆盖规则的增删改查与匹配逻辑。
- `override_identity.rs`：覆盖规则标识与归一化逻辑。
- `breakpoints.rs`：断点规则管理与相关接口（基于 method+origin+path 生成确定性 id，并保证唯一性）。
- `saved_requests.rs`：已保存请求管理与持久化接口。
- `body_format.rs`：请求/响应体格式化能力。

## 测试文件说明

- `api_tests.rs`：API 路由与接口行为测试。
- `proxy_tests.rs`：代理链路与转发行为测试。
- `state_tests.rs`：应用状态流转与状态操作测试。

## 维护要求

新增、删除或重命名模块文件，或模块职责发生变化时，必须同步更新本文件；涉及接口行为变更时，必须同步更新对应测试。
