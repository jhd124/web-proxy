import { Database } from 'bun:sqlite'
import type { LicensePayload } from '../license'
import type { PlanName } from '../config'

export type PaymentOrderInput = {
  provider: string
  providerEventId: string
  providerOrderId: string
  priceId: string
  customerEmail?: string | null
  rawEvent: unknown
}

export type LicenseRecord = {
  licenseId: string
  licenseKey: string
  plan: PlanName
  customerEmail?: string | null
  issuedAt: string
  expiresAt?: string | null
  revokedAt?: string | null
}

export type RemoteServerStore = {
  close: () => void
  createOrderIfNew: (input: PaymentOrderInput) => boolean
  saveLicense: (input: {
    providerOrderId: string
    licenseKey: string
    payload: LicensePayload
  }) => void
  getLicense: (licenseId: string) => LicenseRecord | null
}

export function openStore(databasePath: string): RemoteServerStore {
  const db = new Database(databasePath)
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      provider_event_id TEXT NOT NULL UNIQUE,
      provider_order_id TEXT NOT NULL,
      price_id TEXT NOT NULL,
      customer_email TEXT,
      raw_event_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS licenses (
      license_id TEXT PRIMARY KEY NOT NULL,
      provider_order_id TEXT NOT NULL,
      license_key TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      plan TEXT NOT NULL,
      customer_email TEXT,
      issued_at TEXT NOT NULL,
      expires_at TEXT,
      revoked_at TEXT
    );
  `)

  return {
    close: () => db.close(),
    createOrderIfNew: (input) => {
      const result = db
        .query(
          `
          INSERT OR IGNORE INTO payment_orders (
            provider,
            provider_event_id,
            provider_order_id,
            price_id,
            customer_email,
            raw_event_json,
            created_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
          `,
        )
        .run(
          input.provider,
          input.providerEventId,
          input.providerOrderId,
          input.priceId,
          input.customerEmail ?? null,
          JSON.stringify(input.rawEvent),
          new Date().toISOString(),
        )
      return result.changes > 0
    },
    saveLicense: (input) => {
      db.query(
        `
        INSERT INTO licenses (
          license_id,
          provider_order_id,
          license_key,
          payload_json,
          plan,
          customer_email,
          issued_at,
          expires_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(license_id) DO UPDATE SET
          provider_order_id = excluded.provider_order_id,
          license_key = excluded.license_key,
          payload_json = excluded.payload_json,
          plan = excluded.plan,
          customer_email = excluded.customer_email,
          issued_at = excluded.issued_at,
          expires_at = excluded.expires_at
        `,
      ).run(
        input.payload.licenseId,
        input.providerOrderId,
        input.licenseKey,
        JSON.stringify(input.payload),
        input.payload.plan,
        input.payload.customerEmail ?? null,
        input.payload.issuedAt,
        input.payload.expiresAt ?? null,
      )
    },
    getLicense: (licenseId) => {
      return (
        db
          .query(
            `
            SELECT
              license_id AS licenseId,
              license_key AS licenseKey,
              plan,
              customer_email AS customerEmail,
              issued_at AS issuedAt,
              expires_at AS expiresAt,
              revoked_at AS revokedAt
            FROM licenses
            WHERE license_id = ?1
            `,
          )
          .get(licenseId) as LicenseRecord | null
      )
    },
  }
}
