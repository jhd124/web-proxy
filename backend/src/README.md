# backend/src

`src/` 是后端核心代码目录，包含代理服务、Dashboard API、状态管理与各业务子模块。

## 模块文件说明

- `main.rs`：进程入口，负责加载配置、初始化状态、启动 proxy 与 dashboard 服务，并在 Ctrl+C / SIGTERM 退出时恢复已保存的系统代理快照。
- `api.rs`：Dashboard HTTP/WebSocket 路由与 handler，提供健康检查、抓包查询、操作命令、系统代理开关等接口；`/api/health` 与 WebSocket 广播的代理地址优先展示 macOS WiFi IPv4，取不到时回退到默认出站 IPv4；`/api/requests` 与 WebSocket 只返回轻量摘要，完整请求详情通过 `/api/requests/:id` 按需读取，清空请求时会重置内存中的 traffic buffer。
- `proxy.rs`：HTTP/HTTPS 代理主流程，包含转发、抓包记录、MITM 处理与流式响应处理；macOS 下通过 `lsof` 按连接方向 best-effort 识别客户端进程名；流式响应为 Dashboard 保留有限预览，并在 traffic 清空后停止旧流式连接继续累积预览。
- `state.rs`：全局应用状态定义与状态读写接口；内存中保留完整 `TrafficEntry`，对 dashboard 暴露 `TrafficEntrySummary` 摘要以降低前端常驻内存，并在展示发起应用名时去掉 macOS `Helper` 进程后缀；清空 traffic 时重置列表 buffer、释放活跃流式预览并递增 generation，避免旧流式连接写回已清空列表；规则变更后通过 `recompute_rule_matches` 重算历史 HTTP 条目的 `override_match_id`/`breakpoint_match_id`（潜在命中：第一个 enabled 命中规则；body 类匹配按 `request_body_preview` best-effort），有变化时广播摘要 `snapshot`，把命中计算下沉到后端。
- `ports.rs`：端口解析与默认端口策略。
- `mitm.rs`：MITM 证书与 TLS 相关能力。
- `overrides.rs`：覆盖规则的增删改查与匹配逻辑。
- `override_identity.rs`：覆盖规则标识与归一化逻辑。
- `breakpoints.rs`：断点规则管理与相关接口（创建时使用随机 UUID 作为 id，并基于规范化后的 method+origin+path 手动判重，冲突返回 409；`path` 按字符串精确匹配（归一化后），不再按正则解释；规则持久化到与 `OVERRIDE_DB` 同路径前缀的 `*.breakpoints.json`，重启后自动加载）。
- `saved_requests.rs`：已保存请求管理与持久化接口。
- `body_format.rs`：请求/响应体格式化能力。
- `system_proxy/`：系统 HTTP/HTTPS 代理开关与退出恢复能力，供 Dashboard API 调用，避免前端绑定具体桌面壳实现。

## 测试文件说明

- `api_tests.rs`：API 路由与接口行为测试。
- `proxy_tests.rs`：代理链路与转发行为测试。
- `state_tests.rs`：应用状态流转与状态操作测试。

## 维护要求

新增、删除或重命名模块文件，或模块职责发生变化时，必须同步更新本文件；涉及接口行为变更时，必须同步更新对应测试。
