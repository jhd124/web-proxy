import { createHmac, timingSafeEqual } from 'node:crypto'
import type { ServerConfig } from '../config'
import { createSignedLicense, type SignedLicense } from '../license'
import type { RemoteServerStore } from '../storage/db'

type PaymentWebhookPayload = {
  id?: string
  type?: string
  data?: {
    object?: {
      id?: string
      customer_email?: string | null
      customerEmail?: string | null
      metadata?: Record<string, string | undefined>
      line_items?: {
        data?: Array<{ price?: { id?: string } }>
      }
      price_id?: string
      priceId?: string
    }
  }
}

export async function handlePaymentWebhook(input: {
  request: Request
  config: ServerConfig
  store: RemoteServerStore
}): Promise<Response> {
  const rawBody = await input.request.text()
  if (!isValidWebhookSignature(input.request, rawBody, input.config.paymentWebhookSecret)) {
    return Response.json({ ok: false, error: 'invalidSignature' }, { status: 401 })
  }

  const payload = JSON.parse(rawBody) as PaymentWebhookPayload
  const parsed = parseSuccessfulPayment(payload)
  if (!parsed) {
    return Response.json({ ok: true, ignored: true })
  }

  const plan = input.config.pricePlanMap[parsed.priceId]
  if (!plan) {
    return Response.json(
      { ok: false, error: 'unknownPrice', priceId: parsed.priceId },
      { status: 400 },
    )
  }

  const isNewOrder = input.store.createOrderIfNew({
    provider: 'payment',
    providerEventId: parsed.eventId,
    providerOrderId: parsed.orderId,
    priceId: parsed.priceId,
    customerEmail: parsed.customerEmail,
    rawEvent: payload,
  })
  if (!isNewOrder) {
    return Response.json({ ok: true, duplicate: true })
  }

  const signedLicense = createSignedLicense({
    plan,
    limits: input.config.planLimits[plan],
    privateKeyPem: input.config.licensePrivateKeyPem,
    customerEmail: parsed.customerEmail,
  })
  input.store.saveLicense({
    providerOrderId: parsed.orderId,
    licenseKey: signedLicense.licenseKey,
    payload: signedLicense.payload,
  })

  return Response.json(toWebhookResponse(signedLicense))
}

function parseSuccessfulPayment(payload: PaymentWebhookPayload):
  | {
      eventId: string
      orderId: string
      priceId: string
      customerEmail?: string | null
    }
  | null {
  const eventType = payload.type ?? ''
  if (eventType && !eventType.includes('checkout') && !eventType.includes('paid')) {
    return null
  }
  const object = payload.data?.object
  const eventId = payload.id?.trim()
  const orderId = object?.id?.trim()
  const priceId =
    object?.price_id?.trim() ??
    object?.priceId?.trim() ??
    object?.metadata?.priceId?.trim() ??
    object?.line_items?.data?.[0]?.price?.id?.trim()
  if (!eventId || !orderId || !priceId) {
    return null
  }
  return {
    eventId,
    orderId,
    priceId,
    customerEmail: object?.customer_email ?? object?.customerEmail ?? null,
  }
}

function isValidWebhookSignature(
  request: Request,
  rawBody: string,
  secret: string,
): boolean {
  const signature =
    request.headers.get('x-proxy-signature') ??
    request.headers.get('x-webhook-signature') ??
    ''
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  return safeEqual(signature, expected)
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8')
  const rightBuffer = Buffer.from(right, 'utf8')
  if (leftBuffer.byteLength !== rightBuffer.byteLength) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

function toWebhookResponse(signedLicense: SignedLicense): object {
  return {
    ok: true,
    licenseId: signedLicense.licenseId,
    licenseKey: signedLicense.licenseKey,
  }
}
