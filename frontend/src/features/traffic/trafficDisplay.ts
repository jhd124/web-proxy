import type { TrafficEntry } from '../../types'
import { trafficTexts as t } from './texts'

export function isMitmHandshakeFailureError(
  err: string | null | undefined,
): boolean {
  return Boolean(
    err && (err.startsWith('CONNECT upgrade:') || err.includes('MITM ')),
  )
}

export function getTrafficSchemeLabel(entry: TrafficEntry): string {
  return entry.kind === 'connect' ? t.schemeHttps : entry.scheme.toUpperCase()
}

export function getTrafficSummary(entry: TrafficEntry): string {
  if (entry.kind !== 'connect') return entry.url
  if (entry.mitmBypassed) return t.connectMitmBypassed(entry.url)
  if (isMitmHandshakeFailureError(entry.error)) {
    return t.connectMitmHandshakeFailed(entry.url)
  }
  return t.connectTunnel(entry.url)
}

export function getTrafficConnectDetailNote(
  error: string | null | undefined,
  mitmBypassed?: boolean,
): string {
  if (mitmBypassed) return t.mitmBypassedNote
  if (isMitmHandshakeFailureError(error)) return t.mitmHandshakeNote
  return t.connectNote
}
