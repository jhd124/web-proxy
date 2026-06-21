import type { TrafficEntrySummary } from '../../types'

// 资源类型可选值（用于按响应内容或 URL 后缀归类）
export const RESOURCE_TYPE_VALUES = [
  'document',
  'js',
  'css',
  'image',
  'video',
  'font',
  'wasm',
  'json',
  'other',
] as const
export type ResourceTypeValue = (typeof RESOURCE_TYPE_VALUES)[number]

// 请求方法可选值，WEBSOCKET 为升级握手的派生标记
export const METHOD_VALUES = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'OPTIONS',
  'HEAD',
  'WEBSOCKET',
] as const
export type MethodValue = (typeof METHOD_VALUES)[number]

// 响应状态码按百位分组
export const STATUS_CLASS_VALUES = ['1xx', '2xx', '3xx', '4xx', '5xx'] as const
export type StatusClassValue = (typeof STATUS_CLASS_VALUES)[number]

export interface TrafficFilters {
  resourceTypes: string[]
  methods: string[]
  statusClasses: string[]
  requesterApps: string[]
}

export type TrafficFilterGroupKey = keyof TrafficFilters

const FILTER_TOKEN_SPLIT_REGEX = /[\s,]+/
const DOT_VARIANT_REGEX = /[．。]/g

export const EMPTY_TRAFFIC_FILTERS: TrafficFilters = {
  resourceTypes: [],
  methods: [],
  statusClasses: [],
  requesterApps: [],
}

export function hasActiveTrafficFilters(filters: TrafficFilters): boolean {
  return (
    filters.resourceTypes.length > 0 ||
    filters.methods.length > 0 ||
    filters.statusClasses.length > 0 ||
    filters.requesterApps.length > 0
  )
}

export function parseTrafficFilterKeywords(raw: string): string[] {
  const dedupedKeywords = new Set(
    raw
      .split(FILTER_TOKEN_SPLIT_REGEX)
      .map(normalizeTrafficFilterText)
      .filter((keyword) => keyword.length > 0),
  )
  return [...dedupedKeywords]
}

export function entryMatchesUrlKeywords(
  entry: TrafficEntrySummary,
  keywords: readonly string[],
): boolean {
  if (keywords.length === 0) return true
  const urlFilterText = entry.urlFilterText
  if (urlFilterText) {
    const hasBackendTextMatch = keywords.some((keyword) =>
      urlFilterText.includes(keyword),
    )
    if (hasBackendTextMatch) return true
  }
  const urlCandidates = getUrlFilterCandidates(entry.url)
  return keywords.some((keyword) =>
    urlCandidates.some((urlCandidate) => urlCandidate.includes(keyword)),
  )
}

function normalizeTrafficFilterText(value: string): string {
  return value.trim().normalize('NFKC').replace(DOT_VARIANT_REGEX, '.').toLowerCase()
}

function getUrlFilterCandidates(url: string): string[] {
  const normalizedUrl = normalizeTrafficFilterText(url)
  const decodedUrl = decodeUrlForFilter(url)
  if (decodedUrl === normalizedUrl) return [normalizedUrl]
  return [normalizedUrl, decodedUrl]
}

function decodeUrlForFilter(url: string): string {
  try {
    return normalizeTrafficFilterText(decodeURIComponent(url))
  } catch {
    return normalizeTrafficFilterText(url)
  }
}

function getResponseContentType(entry: TrafficEntrySummary): string {
  return entry.responseContentType?.toLowerCase() ?? ''
}

function isWebSocketEntry(entry: TrafficEntrySummary): boolean {
  return entry.websocket
}

function classifyByContentType(contentType: string): ResourceTypeValue | null {
  if (!contentType) return null
  if (contentType.includes('text/html')) return 'document'
  if (contentType.includes('javascript') || contentType.includes('ecmascript')) {
    return 'js'
  }
  if (contentType.includes('text/css')) return 'css'
  if (contentType.includes('application/wasm')) return 'wasm'
  if (contentType.includes('application/json') || contentType.includes('+json')) {
    return 'json'
  }
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.startsWith('video/') || contentType.startsWith('audio/')) {
    return 'video'
  }
  if (contentType.startsWith('font/') || contentType.includes('font')) return 'font'
  return null
}

const EXTENSION_TO_RESOURCE_TYPE: Record<string, ResourceTypeValue> = {
  html: 'document',
  htm: 'document',
  js: 'js',
  mjs: 'js',
  cjs: 'js',
  jsx: 'js',
  ts: 'js',
  tsx: 'js',
  css: 'css',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  ico: 'image',
  bmp: 'image',
  avif: 'image',
  mp4: 'video',
  webm: 'video',
  ogg: 'video',
  mov: 'video',
  avi: 'video',
  mkv: 'video',
  mp3: 'video',
  wav: 'video',
  flac: 'video',
  m4a: 'video',
  woff: 'font',
  woff2: 'font',
  ttf: 'font',
  otf: 'font',
  eot: 'font',
  wasm: 'wasm',
  json: 'json',
}

function classifyByExtension(path: string): ResourceTypeValue | null {
  const pathWithoutQuery = path.split(/[?#]/)[0] ?? ''
  const lastSegment = pathWithoutQuery.split('/').pop() ?? ''
  const dotIndex = lastSegment.lastIndexOf('.')
  if (dotIndex < 0) return null
  const extension = lastSegment.slice(dotIndex + 1).toLowerCase()
  return EXTENSION_TO_RESOURCE_TYPE[extension] ?? null
}

export function classifyResourceType(entry: TrafficEntrySummary): ResourceTypeValue {
  if (isResourceTypeValue(entry.resourceType)) return entry.resourceType
  const byContentType = classifyByContentType(getResponseContentType(entry))
  if (byContentType) return byContentType
  const byExtension = classifyByExtension(entry.path)
  if (byExtension) return byExtension
  return 'other'
}

export function getEntryMethodTag(entry: TrafficEntrySummary): string {
  if (entry.methodTag) return entry.methodTag
  if (isWebSocketEntry(entry)) return 'WEBSOCKET'
  return entry.method.toUpperCase()
}

export function getEntryStatusClass(entry: TrafficEntrySummary): StatusClassValue | null {
  if (isStatusClassValue(entry.statusClass)) return entry.statusClass
  const status = entry.responseStatus
  if (status == null || status < 100 || status >= 600) return null
  return `${Math.floor(status / 100)}xx` as StatusClassValue
}

export function getRequesterAppName(entry: TrafficEntrySummary): string {
  return entry.requesterAppName || entry.peer || '—'
}

export function entryMatchesTrafficFilters(
  entry: TrafficEntrySummary,
  filters: TrafficFilters,
): boolean {
  if (
    filters.resourceTypes.length > 0 &&
    !filters.resourceTypes.includes(classifyResourceType(entry))
  ) {
    return false
  }
  if (
    filters.methods.length > 0 &&
    !filters.methods.includes(getEntryMethodTag(entry))
  ) {
    return false
  }
  if (filters.statusClasses.length > 0) {
    const statusClass = getEntryStatusClass(entry)
    if (statusClass == null || !filters.statusClasses.includes(statusClass)) {
      return false
    }
  }
  if (filters.requesterApps.length > 0) {
    const requesterAppName = getRequesterAppName(entry).toLowerCase()
    const hasMatchedRequesterApp = filters.requesterApps.some(
      (value) => requesterAppName === value.toLowerCase(),
    )
    if (!hasMatchedRequesterApp) return false
  }
  return true
}

function isResourceTypeValue(value: string | undefined): value is ResourceTypeValue {
  return RESOURCE_TYPE_VALUES.includes(value as ResourceTypeValue)
}

function isStatusClassValue(
  value: string | null | undefined,
): value is StatusClassValue {
  return STATUS_CLASS_VALUES.includes(value as StatusClassValue)
}
