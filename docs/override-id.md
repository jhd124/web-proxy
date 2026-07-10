# Override 规则 ID 的计算规则

每条 override 规则的主键 `id` 不是随机 UUID，而是对**规范匹配串**做 **SHA-256** 后得到的 **64 位小写十六进制**字符串。  
后端实现：`backend/src/override_identity.rs`；前端预览（与后端一致）：`frontend/src/lib/overrideIdentity.ts`。

## 规范串 `identity_material` 的拼接顺序

将以下各段**直接拼接**（段与段之间**无**额外分隔符），再对该 UTF-8 字节序列做 SHA-256：

```
material = M + P + H + Path + H_blob + Q_blob + B
```

| 段 | 含义 | 缺省 / 空值 |
|----|------|-------------|
| **M** | 请求方法，如 `GET` / `POST` | 无则 `""` |
| **P** | 协议，如 `http` / `https` | 无则 `""` |
| **H** | 主机名（`match_host`） | 无则 `""`；**当前产品要求创建/更新时 host 非空**，若仍见空串多为历史数据 |
| **Path** | 仅路径，不含 `?` | 见下「Path 段」 |
| **H_blob** | 要匹配的**请求头** | 见下「键值表 blob」 |
| **Q_blob** | 要匹配的**查询参数** | 见下「键值表 blob」 |
| **B** | 要匹配的**请求体**整段字符串 | 无则 `""` |

最终：

```text
id = 小写十六进制( SHA256( UTF-8( material ) ) )
```

## Path 段

- `match_path` 为 `None`、或**仅空白**：Path 在规范串中为 **`""`**（不写入 `/`）。
- 非空：先 **trim**，再与流量侧一致地做路径规范化：空则变为 `/`，否则保证以 `/` 开头（与 `normalize_path_for_id` / 前端的 `normalizePath` 对齐）。

## 键值表 blob（`H_blob` / `Q_blob`）

对表 `Vec<(String, String)>`（请求头或查询参数）：

1. 按**字典序**排序，排序键为：`(key 的 ASCII 小写形式, value 字符串)`（先比 key 小写，再比 value）。
2. 排序后，对每个 `(k, v)` 依次拼：`to_lowercase(k) + v`（**无**中间分隔符）。
3. 将所有条目拼成一个大字符串。

与「JSON 序列化」不同；顺序与拼接方式以 `sorted_kv_blob` 为准。

## 请求体段 B

`match_request_body` 缺省为 `""`。非空时，**整段字符串**原样进入规范串（UTF-8 字节与 Rust/TS 源字符串一致）。

## 前端预览时的注意点

- 表单项里**全空**的 key/value 行在参与 id 预览时会被**过滤**后再参与 `H_blob` / `Q_blob`（`cleanKv`），与「保存时去掉空行」的语义一致，避免与保存后的 id 不一致。

## 存储层（SQLite）

- `overrides` 表中 `id` 为 **`TEXT PRIMARY KEY`（且 `NOT NULL`）**：在数据库层面**唯一、不可重复**；重复插入会违反主键/唯一约束，服务端对应返回 **409 CONFLICT**（含与预检 `override_exists` 的竞态）。
- 应用内顺序列表仍以内存 `Vec` 为准，持久化时以 `id` 为行的唯一主键。

## 稳定性与变更

- 同一条规则、同一套 match 相关字段，计算出的 `id` **稳定、可复现**。
- 若修改任何参与 `material` 的字段，会得到**新的** `id`；服务端在更新时若新 id 与旧 id 不同，会按实现删除旧行再插入新行（以实际 `backend/src/overrides.rs` 为准）。

## 相同 host、path 下多条约规则能否并存

可以。**存储层**只以 `id` 为主键；**没有**「同一 host + path 只能一条」的约束。

- 两条规则若 **H、Path 相同**，但 **M、P、H_blob、Q_blob、B** 中任一项在规范串里不同，则 `material` 不同 → **`id` 不同** → 可同时插入数据库。
- 若**整条** `material` 与另一条完全相同，则 `id` 相同 → 创建时会出现 **409 CONFLICT**（与「两条完全相同的匹配定义不能重复」一致）。

因此：**只要 `id` 不同，就允许同时存在**；即「同 host、同 path」时，仍可通过不同协议、请求头、查询参数、请求体等区分出不同 `id`。

### 与代理命中优先级的关系

`backend/src/proxy.rs` 的 `find_override` 与 `state.rs` 的 `recompute_rule_matches` 会在所有 `matches` 为真的 enabled 规则中，选取 **`match_specificity` 分数最高**的一条生效。分数越高表示匹配条件越具体（method、protocol、path、请求头、查询参数、请求体等约束越多；host/path 中通配符越少、字面量越长分数越高）。同分时列表靠前（较新）者优先。

若需要避免歧义，仍应让各条规则在 M / P / H_blob / Q_blob / B 等维度上**互斥**；或在同分时接受「较新规则优先」。

## 与响应内容的关系

**响应**的 status / response headers / response **body** 不参与 `id` 计算；`id` 只由**如何匹配请求**的字段（M、P、H、Path、H_blob、Q_blob、B）决定。
