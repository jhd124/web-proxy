import { getImageMimeFromContentType } from './overrideResponseLanguage'

const BINARY_PREVIEW_RE = /^<binary\s+\d+\s+bytes>$/i

/** 将 override body 转为可在 `<img src>` 使用的 data URL；无法展示时返回 null。 */
export function overrideBodyToImageSrc(
  body: string,
  contentType: string,
): string | null {
  const trimmed = body.trim()
  if (!trimmed || BINARY_PREVIEW_RE.test(trimmed)) return null

  if (trimmed.startsWith('data:image/')) {
    return trimmed
  }

  const mime = getImageMimeFromContentType(contentType)
  if (!mime) return null

  const compact = trimmed.replace(/\s/g, '')
  if (!/^[A-Za-z0-9+/=]+$/.test(compact) || compact.length < 8) {
    return null
  }

  return `data:${mime};base64,${compact}`
}
