import { loadConfig } from './config'
import { createSignedLicense } from './license'
import { openStore, type RemoteServerStore } from './storage/db'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0:0:0:0:0:0:0:1'])
const config = loadConfig()
const store = openStore(config.databasePath)

let hasRegisteredShutdown = false

export function getRemoteServerContext(): {
  config: ReturnType<typeof loadConfig>
  store: RemoteServerStore
} {
  registerShutdownHandler()
  return { config, store }
}

export async function handleManualLicense(request: Request): Promise<Response> {
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

export async function handleFreeLicense(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    customerEmail?: string | null
    expiresAt?: string | null
    deviceLimit?: number | null
  }
  const plan = 'trial'
  const signedLicense = createSignedLicense({
    plan,
    limits: config.planLimits[plan],
    privateKeyPem: config.licensePrivateKeyPem,
    customerEmail: normalizeOptionalString(body.customerEmail),
    expiresAt: normalizeOptionalString(body.expiresAt),
    deviceLimit: normalizeOptionalNumber(body.deviceLimit),
  })
  store.saveLicense({
    providerOrderId: `local-free:${signedLicense.licenseId}`,
    licenseKey: signedLicense.licenseKey,
    payload: signedLicense.payload,
  })
  return Response.json({
    ok: true,
    licenseId: signedLicense.licenseId,
    licenseKey: signedLicense.licenseKey,
    payload: signedLicense.payload,
  })
}

export function handleLicenseDetail(licenseId: string): Response {
  const license = store.getLicense(licenseId)
  if (!license) {
    return Response.json({ ok: false, error: 'notFound' }, { status: 404 })
  }
  return Response.json({ ok: true, license })
}

export function isLocalOnlyRequest(request: Request): boolean {
  const hostname = normalizeHost(new URL(request.url).hostname)
  if (!isLocalAddress(hostname)) return false

  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwardedFor && !isLocalAddress(forwardedFor)) return false

  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp && !isLocalAddress(realIp)) return false

  return true
}

export function localOnlyForbiddenResponse(): Response {
  return Response.json({ ok: false, error: 'localOnly' }, { status: 403 })
}

function isAuthorizedAdminRequest(request: Request): boolean {
  const token = process.env.ADMIN_TOKEN?.trim()
  if (!token) return false
  const authorization = request.headers.get('authorization') ?? ''
  return authorization === `Bearer ${token}`
}

function isLocalAddress(value: string): boolean {
  const normalized = normalizeHost(value)
  return (
    LOCAL_HOSTS.has(normalized) ||
    normalized.startsWith('127.') ||
    normalized.startsWith('::ffff:127.')
  )
}

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/^\[/u, '').replace(/\]$/u, '')
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeOptionalNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function registerShutdownHandler(): void {
  if (hasRegisteredShutdown) return
  hasRegisteredShutdown = true
  process.on('SIGINT', () => {
    store.close()
    process.exit(0)
  })
}
