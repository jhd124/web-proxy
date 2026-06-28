# backend/src

`src/` 是后端核心代码目录，包含代理服务、Dashboard API、状态管理与各业务子模块。

## 模块文件说明

- `main.rs`：进程入口，负责加载配置、初始化状态、启动 proxy 与 dashboard 服务，并在 Ctrl+C / SIGTERM 退出时恢复已保存的系统代理快照。
- `api.rs`：Dashboard HTTP/WebSocket 路由与 handler，提供健康检查、抓包查询、操作命令、系统代理开关等接口；`/api/billing/*` 提供 License 状态与激活；`/api/health` 与 WebSocket 广播的代理地址优先展示 macOS WiFi IPv4，取不到时回退到默认出站 IPv4；`/api/requests` 与 WebSocket 只返回轻量摘要，完整请求详情通过 `/api/requests/:id` 按需读取，清空请求时会重置内存中的 traffic buffer；`/api/search` 提供跨 traffic/override/breakpoint/saved 的全局文本搜索；`/api/hosts*` 提供 hosts 托管配置与系统 hosts 文件直接读写能力；`/api/request-catalog/*` 提供请求编写器补全/模板/settings；`/api/request-composer/*` 提供请求发送与历史记录。
- `proxy.rs`：HTTP/HTTPS 代理主流程，包含转发、抓包记录、MITM 处理与流式响应处理；MITM 解密后的 HTTP/1.1 `Upgrade`/WebSocket 请求会转为上游 101 后双向透明隧道，避免被普通 HTTP 重放破坏实时连接；override 匹配时 host 保留 URL 中的显式端口（如 `localhost:3000`），与 `match_host` 字段一致；macOS 下通过 `lsof` 按连接方向 best-effort 识别客户端进程名；流式响应为 Dashboard 保留有限预览，并在 traffic 清空后停止旧流式连接继续累积预览。
- `state.rs`：全局应用状态定义与状态读写接口；持有 billing 状态用于后端配额 enforcement；内存中保留完整 `TrafficEntry`，对 dashboard 暴露 `TrafficEntrySummary` 摘要以降低前端常驻内存，摘要会预计算资源类型、方法 tag、状态分组、URL 筛选文本与列表搜索文本，减少前端 traffic 列表的全量派生开销；展示发起应用名时去掉 macOS `Helper` 进程后缀；清空 traffic 时重置列表 buffer、释放活跃流式预览并递增 generation，避免旧流式连接写回已清空列表；规则变更后通过 `recompute_rule_matches` 重算历史 HTTP 条目的 `override_match_id`/`breakpoint_match_id`（潜在命中：第一个 enabled 命中规则；body 类匹配按 `request_body_preview` best-effort），有变化时广播摘要 `snapshot`，把命中计算下沉到后端。
- `ports.rs`：端口解析与默认端口策略；Electron 发布态通过 `DASHBOARD_DIST` + `PROXY_DATA_DIR/listen-ports.json` 等待 dashboard 实际端口。
- `advanced_search.rs`：全局文本搜索接口实现，扫描内存 traffic、override、breakpoint 与已保存请求，返回分组后的节选结果，避免向前端传输完整 body。
- `billing.rs`：License Key 验签、激活状态持久化、试用/付费配额计算与结构化超限错误；试用版断点、Override、Saved Requests 各最多新增 1 条。
- `mitm.rs`：MITM 证书与 TLS 相关能力。
- `overrides.rs`：覆盖规则的增删改查与匹配逻辑。
- `override_identity.rs`：覆盖规则标识与归一化逻辑。
- `breakpoints.rs`：断点规则管理与相关接口（创建时使用随机 UUID 作为 id，并基于规范化后的 method+origin+path 手动判重，冲突返回 409；`path` 按字符串精确匹配（归一化后），不再按正则解释；规则持久化到与 `OVERRIDE_DB` 同路径前缀的 `*.breakpoints.json`，重启后自动加载）。
- `hosts.rs`：系统 hosts 文件托管能力；配置持久化到与 `OVERRIDE_DB` 同目录的 `proxy-hosts.json`，配置文件缺失时会从系统 hosts 中的 `proxy-app` 标记区块恢复（适配重装场景）；系统写入只替换标记区块，支持 macOS/Linux `/etc/hosts` 与 Windows `System32\drivers\etc\hosts` 路径；直接写入被拒绝时由后端触发平台授权兜底（macOS `osascript`、Linux `pkexec`、Windows elevated PowerShell）。
- `saved_requests.rs`：已保存请求管理与持久化接口。
- `request_catalog.rs`：请求模板索引与补全接口，使用 SQLite 持久化 API-only 的 `host + path + method` 模板和 host 级 headers；写入先进入内存聚合器，再按批量/时间窗口 flush，避免每条代理请求同步写库。
- `request_composer.rs`：请求编写器发送 API 与历史记录持久化；发送结果会写入 traffic 列表、composer history，并作为 catalog 候选参与后续补全。
- `body_format.rs`：请求/响应体格式化能力。
- `system_proxy/`：系统 HTTP/HTTPS 代理开关与退出恢复能力，供 Dashboard API 调用，避免前端绑定具体桌面壳实现。

## 测试文件说明

- `api_tests.rs`：API 路由与接口行为测试。
- `proxy_tests.rs`：代理链路与转发行为测试。
- `state_tests.rs`：应用状态流转与状态操作测试。

## 维护要求

新增、删除或重命名模块文件，或模块职责发生变化时，必须同步更新本文件；涉及接口行为变更时，必须同步更新对应测试。
