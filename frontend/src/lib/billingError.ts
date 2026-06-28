import type { LicensedFeature } from '../types'

type BillingApiError = {
  code?: string
  feature?: LicensedFeature
  limit?: number
  used?: number
}

const FEATURE_LABELS: Record<LicensedFeature, string> = {
  breakpoints: '断点',
  overrides: 'Override',
  savedRequests: 'Saved Requests',
}

export async function readBillingErrorMessage(
  response: Response,
): Promise<string | null> {
  if (response.status !== 402 && response.status !== 403) return null
  const error = (await response.clone().json().catch(() => null)) as BillingApiError | null
  if (error?.code !== 'quotaExceeded' || !error.feature) return null
  const featureLabel = FEATURE_LABELS[error.feature]
  const limitText = error.limit == null ? '' : `最多只能添加 ${error.limit} 条`
  return `试用版${featureLabel}${limitText}，请激活 License 解锁更多。`
}
