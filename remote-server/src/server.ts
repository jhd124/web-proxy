import { loadConfig } from './config'
import { createSignedLicense } from './license'
import { handlePaymentWebhook } from './payments/webhook'
import { openStore } from './storage/db'

const config = loadConfig()
const store = openStore(config.databasePath)

const server = Bun.serve({
  port: config.port,
  async fetch(request) {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/') {
      return htmlResponse(renderHomePage())
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true })
    }
    if (request.method === 'POST' && url.pathname === '/webhooks/payment') {
      return handlePaymentWebhook({ request, config, store })
    }
    if (request.method === 'POST' && url.pathname === '/licenses/manual') {
      return handleManualLicense(request)
    }
    const licenseMatch = url.pathname.match(/^\/licenses\/([^/]+)$/u)
    if (request.method === 'GET' && licenseMatch) {
      return handleLicenseDetail(licenseMatch[1])
    }
    return Response.json({ ok: false, error: 'notFound' }, { status: 404 })
  },
})

console.info(`remote-server listening on http://127.0.0.1:${server.port}`)

process.on('SIGINT', () => {
  store.close()
  process.exit(0)
})

async function handleManualLicense(request: Request): Promise<Response> {
  if (!isAuthorizedAdminRequest(request)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const body = (await request.json()) as {
    plan?: 'trial' | 'pro'
    customerEmail?: string | null
    expiresAt?: string | null
    deviceLimit?: number | null
  }
  const plan = body.plan ?? 'pro'
  const signedLicense = createSignedLicense({
    plan,
    limits: config.planLimits[plan],
    privateKeyPem: config.licensePrivateKeyPem,
    customerEmail: body.customerEmail ?? null,
    expiresAt: body.expiresAt ?? null,
    deviceLimit: body.deviceLimit ?? null,
  })
  store.saveLicense({
    providerOrderId: `manual:${signedLicense.licenseId}`,
    licenseKey: signedLicense.licenseKey,
    payload: signedLicense.payload,
  })
  return Response.json({
    ok: true,
    licenseId: signedLicense.licenseId,
    licenseKey: signedLicense.licenseKey,
  })
}

function handleLicenseDetail(licenseId: string): Response {
  const license = store.getLicense(licenseId)
  if (!license) {
    return Response.json({ ok: false, error: 'notFound' }, { status: 404 })
  }
  return Response.json({ ok: true, license })
}

function isAuthorizedAdminRequest(request: Request): boolean {
  const token = process.env.ADMIN_TOKEN?.trim()
  if (!token) return false
  const authorization = request.headers.get('authorization') ?? ''
  return authorization === `Bearer ${token}`
}

function renderHomePage(): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Proxy License Server</title>
  </head>
  <body>
    <main>
      <h1>Proxy License Server</h1>
      <p>支付完成后，服务会签发 License Key。请复制 License Key 到桌面应用内激活。</p>
    </main>
  </body>
</html>`
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  })
}
