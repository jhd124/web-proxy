# remote-server

`remote-server/` 是基于 TanStack Start 的 SSR License 发码网站，负责把支付结果转换为客户端可验证的 License Key。服务端持有 Ed25519 私钥，客户端只内置对应公钥。

## 目录结构

- `package.json`：TanStack Start 的 Bun/Vite 启动、构建与 TypeScript 检查脚本。
- `vite.config.ts`：TanStack Start、React 与 Nitro Bun preset 配置。
- `src/router.tsx`：TanStack Router SSR 路由工厂。
- `src/routes/`：SSR 页面与 server routes，提供首页、本地免费 License 页面、健康检查、支付 webhook、License 查询与手工发码接口。
- `src/serverContext.ts`：服务端配置、SQLite store 和手工发码处理逻辑。
- `src/config.ts`：读取端口、数据库、webhook secret、License 密钥与 price/plan 映射。
- `src/license.ts`：生成 License payload，并用 Ed25519 私钥签名为 `proxy-license-v1.<payload>.<signature>`。
- `src/payments/webhook.ts`：支付 webhook 适配层，校验 HMAC 签名并触发发码。
- `src/storage/db.ts`：SQLite 持久化订单与 License 记录。

## 环境变量

- `LICENSE_PRIVATE_KEY`：Ed25519 私钥 PEM，仅允许存在于发码服务。
- `LICENSE_PUBLIC_KEY`：Ed25519 公钥原始 32 字节的 base64url 字符串，用于和客户端配置保持一致。
- `PAYMENT_WEBHOOK_SECRET`：支付平台 webhook 签名密钥。
- `ADMIN_TOKEN`：调用 `POST /licenses/manual` 的管理 token。
- `REMOTE_SERVER_DB`：SQLite 路径，默认 `remote-server.sqlite3`。
- `PORT`：服务端口，默认 `8787`。
- `PRICE_PLAN_MAP`：price id 到 plan 的 JSON 映射，默认 `{ "price_proxy_pro": "pro" }`。

## 接口

- `GET /health`：健康检查。
- `POST /webhooks/payment`：支付平台回调，要求 `x-proxy-signature` 或 `x-webhook-signature` 为 HMAC-SHA256 hex。
- `GET /licenses/:licenseId`：查询 License 记录。
- `POST /licenses/manual`：手工发码，要求 `Authorization: Bearer <ADMIN_TOKEN>`。
- `GET /local/free-license`：仅允许本地访问的免费 License 生成页面。
- `POST /local/free-license`：仅允许本地访问，生成 `trial` 免费 License。

## 本地运行

`remote-server/.env.local` 提供本地开发用的 License 密钥和 webhook secret。该文件只用于本机开发，已被 Git 忽略；生产部署时必须改用真实密钥。

```bash
bun install
bun run dev
```

构建并运行生产产物：

```bash
bun run build
bun run start
```

生产部署时必须使用真实私钥、webhook secret 和持久化数据库；不要把 `LICENSE_PRIVATE_KEY` 打包进客户端或桌面应用。
