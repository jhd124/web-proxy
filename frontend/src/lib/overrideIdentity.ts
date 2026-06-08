/**
 * Override id（SHA-256）与后端 `src/override_identity.rs` 对齐；完整规则见 `docs/override-id.md`。
 */
import type { OverrideFormState, OverrideRule } from '../types'
import { normalizePath } from './dashboardUtils'

export function sortedKvBlob(pairs: [string, string][]): string {
  const sorted = [...pairs].sort((a, b) => {
    const la = a[0].toLowerCase()
    const lb = b[0].toLowerCase()
    if (la !== lb) return la.localeCompare(lb, undefined, { sensitivity: 'base' })
    return a[1].localeCompare(b[1], undefined, { sensitivity: 'base' })
  })
  return sorted.map(([k, v]) => k.toLowerCase() + v).join('')
}

/**
 * Canonical string hashed to the override id (mirrors `override_identity` in Rust):
 * method + protocol + host + path + sorted headers/query + body.
 */
export function identityMaterialFromMatch(args: {
  matchMethod: string
  matchProtocol: string
  matchHost: string
  matchPath: string
  matchRequestHeaders: [string, string][]
  matchQuery: [string, string][]
  matchRequestBody: string
}): string {
  const m = args.matchMethod
  const p = args.matchProtocol
  const h = args.matchHost
  const path =
    args.matchPath.trim() === '' ? '' : normalizePath(args.matchPath)
  const hb = sortedKvBlob(args.matchRequestHeaders)
  const qb = sortedKvBlob(args.matchQuery)
  const b = args.matchRequestBody
  return `${m}${p}${h}${path}${hb}${qb}${b}`
}

export async function sha256Hex(utf8: string): Promise<string> {
  const data = new TextEncoder().encode(utf8)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join(
    '',
  )
}

export async function computeOverrideIdFromForm(args: {
  matchMethod: string
  matchProtocol: string
  matchHost: string
  matchPath: string
  matchRequestHeaders: [string, string][]
  matchQuery: [string, string][]
  matchRequestBody: string
}): Promise<string> {
  const m = identityMaterialFromMatch(args)
  return sha256Hex(m)
}

function cleanKv(pairs: [string, string][]): [string, string][] {
  return pairs.filter(([a, b]) => a.trim() !== '' || b.trim() !== '')
}

export async function computeOverrideIdFromFormState(
  f: OverrideFormState,
): Promise<string> {
  const matchRequestHeaders = cleanKv(f.matchRequestHeaders)
  const matchQuery = cleanKv(f.matchQuery)
  return computeOverrideIdFromForm({
    matchMethod: f.matchMethod,
    matchProtocol: f.matchProtocol,
    matchHost: f.matchHost,
    matchPath: f.matchPath,
    matchRequestHeaders,
    matchQuery,
    matchRequestBody: f.matchRequestBody,
  })
}

/** JSON body for PUT /api/overrides/:id (shape matches Rust `UpsertOverrideBody`). */
export function apiPayloadFromRule(
  override: OverrideRule,
  body: string,
  enabled: boolean,
) {
  return {
    enabled,
    matchMethod: override.matchMethod?.trim() ? override.matchMethod : null,
    matchProtocol: override.matchProtocol ?? null,
    matchHost: override.matchHost ?? null,
    matchPath: override.matchPath ?? null,
    matchRequestHeaders: override.matchRequestHeaders ?? [],
    matchQuery: override.matchQuery ?? [],
    matchRequestBody: override.matchRequestBody?.trim()
      ? override.matchRequestBody
      : null,
    mapRemoteProtocol: override.mapRemoteProtocol?.trim()
      ? override.mapRemoteProtocol
      : null,
    mapRemoteHost: override.mapRemoteHost?.trim() ? override.mapRemoteHost : null,
    mapRemotePath: override.mapRemotePath?.trim() ? override.mapRemotePath : null,
    status: override.status,
    headers: override.headers,
    body,
    streamIntervalMs: override.streamIntervalMs ?? null,
  }
}
