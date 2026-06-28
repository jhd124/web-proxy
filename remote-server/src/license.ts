import { createPrivateKey, randomUUID, sign } from 'node:crypto'
import type { PlanLimits, PlanName } from './config'

export type LicensePayload = {
  licenseId: string
  plan: PlanName
  limits: PlanLimits
  issuedAt: string
  expiresAt?: string | null
  customerEmail?: string | null
  deviceLimit?: number | null
}

export type SignedLicense = {
  licenseId: string
  payload: LicensePayload
  licenseKey: string
}

const LICENSE_PREFIX = 'proxy-license-v1'

export function createSignedLicense(input: {
  plan: PlanName
  limits: PlanLimits
  privateKeyPem: string
  customerEmail?: string | null
  expiresAt?: string | null
  deviceLimit?: number | null
}): SignedLicense {
  const licenseId = randomUUID()
  const payload: LicensePayload = {
    licenseId,
    plan: input.plan,
    limits: input.limits,
    issuedAt: new Date().toISOString(),
    expiresAt: input.expiresAt ?? null,
    customerEmail: input.customerEmail ?? null,
    deviceLimit: input.deviceLimit ?? null,
  }
  const payloadBase64 = base64UrlEncode(JSON.stringify(payload))
  const signature = signPayload(payloadBase64, input.privateKeyPem)
  return {
    licenseId,
    payload,
    licenseKey: `${LICENSE_PREFIX}.${payloadBase64}.${signature}`,
  }
}

function signPayload(payloadBase64: string, privateKeyPem: string): string {
  const privateKey = createPrivateKey(privateKeyPem)
  const signature = sign(null, Buffer.from(payloadBase64, 'utf8'), privateKey)
  return base64UrlEncode(signature)
}

function base64UrlEncode(value: string | Buffer): string {
  const buffer = typeof value === 'string' ? Buffer.from(value, 'utf8') : value
  return buffer
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '')
}
