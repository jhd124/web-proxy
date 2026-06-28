export type PlanName = 'trial' | 'pro'

export type PlanLimits = {
  breakpoints: number | null
  overrides: number | null
  savedRequests: number | null
}

export type ServerConfig = {
  port: number
  databasePath: string
  licensePrivateKeyPem: string
  licensePublicKeyBase64: string
  paymentWebhookSecret: string
  pricePlanMap: Record<string, PlanName>
  planLimits: Record<PlanName, PlanLimits>
}

const DEFAULT_PRICE_PLAN_MAP: Record<string, PlanName> = {
  price_proxy_pro: 'pro',
}

const PLAN_LIMITS: Record<PlanName, PlanLimits> = {
  trial: {
    breakpoints: 1,
    overrides: 1,
    savedRequests: 1,
  },
  pro: {
    breakpoints: null,
    overrides: null,
    savedRequests: null,
  },
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const licensePrivateKeyPem = requiredEnv(env, 'LICENSE_PRIVATE_KEY')
  const licensePublicKeyBase64 = requiredEnv(env, 'LICENSE_PUBLIC_KEY')
  const paymentWebhookSecret = requiredEnv(env, 'PAYMENT_WEBHOOK_SECRET')
  return {
    port: Number.parseInt(env.PORT ?? '8787', 10),
    databasePath: env.REMOTE_SERVER_DB ?? 'remote-server.sqlite3',
    licensePrivateKeyPem,
    licensePublicKeyBase64,
    paymentWebhookSecret,
    pricePlanMap: parsePricePlanMap(env.PRICE_PLAN_MAP),
    planLimits: PLAN_LIMITS,
  }
}

function parsePricePlanMap(rawValue: string | undefined): Record<string, PlanName> {
  if (!rawValue) return DEFAULT_PRICE_PLAN_MAP
  const parsed = JSON.parse(rawValue) as Record<string, PlanName>
  for (const [priceId, plan] of Object.entries(parsed)) {
    if (plan !== 'trial' && plan !== 'pro') {
      throw new Error(`Unsupported plan "${plan}" for price "${priceId}"`)
    }
  }
  return parsed
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim()
  if (!value) {
    throw new Error(`${key} is required`)
  }
  return value
}
