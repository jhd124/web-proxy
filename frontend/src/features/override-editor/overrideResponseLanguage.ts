import { parseHeadersText } from '../../lib/dashboardUtils'

/** 从响应头文本中取 Content-Type（小写、含 charset 等参数）。 */
export function getResponseContentType(headersText: string): string {
  const headers = parseHeadersText(headersText)
  const row = headers.find(([k]) => k.toLowerCase() === 'content-type')
  return row?.[1]?.toLowerCase() ?? ''
}

/** 响应 MIME 主类型是否为图片。 */
export function isImageContentType(contentType: string): boolean {
  const mime = contentType.split(';')[0]?.trim() ?? ''
  return mime.startsWith('image/')
}

/** 从 Content-Type 取图片 MIME（如 `image/png`）。 */
export function getImageMimeFromContentType(contentType: string): string | null {
  const mime = contentType.split(';')[0]?.trim() ?? ''
  return mime.startsWith('image/') ? mime : null
}

/** Monaco `language` id。 */
export function contentTypeToMonacoLanguage(contentType: string): string {
  const mime = contentType.split(';')[0]?.trim() ?? ''
  if (!mime) return 'plaintext'
  if (mime.startsWith('image/')) return 'plaintext'
  if (mime.includes('json')) return 'json'
  if (
    mime.includes('javascript') ||
    mime === 'application/ecmascript' ||
    mime === 'text/ecmascript'
  ) {
    return 'javascript'
  }
  if (mime.includes('html')) return 'html'
  if (mime.includes('css')) return 'css'
  if (mime.includes('xml')) return 'xml'
  if (mime.startsWith('text/')) return 'plaintext'
  return 'plaintext'
}

/** 支持 beautify / uglify 的 body 种类；与 Monaco 语言不必一一对应。 */
export type OverrideBodyFormatKind = 'json' | 'javascript' | 'html'

export function contentTypeToFormatKind(
  contentType: string,
): OverrideBodyFormatKind | null {
  const mime = contentType.split(';')[0]?.trim() ?? ''
  if (!mime) return null
  if (mime.includes('json')) return 'json'
  if (
    mime.includes('javascript') ||
    mime === 'application/ecmascript' ||
    mime === 'text/ecmascript'
  ) {
    return 'javascript'
  }
  if (mime.includes('html')) return 'html'
  return null
}
