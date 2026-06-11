import type { TrafficEntry } from '../../types'

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
}

export type TrafficFilterGroupKey = keyof TrafficFilters

export const EMPTY_TRAFFIC_FILTERS: TrafficFilters = {
  resourceTypes: [],
  methods: [],
  statusClasses: [],
}

export function hasActiveTrafficFilters(filters: TrafficFilters): boolean {
  return (
    filters.resourceTypes.length > 0 ||
    filters.methods.length > 0 ||
    filters.statusClasses.length > 0
  )
}

function getResponseContentType(entry: TrafficEntry): string {
  const header = entry.responseHeaders?.find(
    ([key]) => key.toLowerCase() === 'content-type',
  )
  return header?.[1]?.toLowerCase() ?? ''
}

function isWebSocketEntry(entry: TrafficEntry): boolean {
  if (entry.responseStatus === 101) return true
  const upgradeHeader = entry.requestHeaders.find(
    ([key]) => key.toLowerCase() === 'upgrade',
  )
  return (upgradeHeader?.[1] ?? '').toLowerCase().includes('websocket')
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

export function classifyResourceType(entry: TrafficEntry): ResourceTypeValue {
  const byContentType = classifyByContentType(getResponseContentType(entry))
  if (byContentType) return byContentType
  const byExtension = classifyByExtension(entry.path)
  if (byExtension) return byExtension
  return 'other'
}

export function getEntryMethodTag(entry: TrafficEntry): string {
  if (isWebSocketEntry(entry)) return 'WEBSOCKET'
  return entry.method.toUpperCase()
}

export function getEntryStatusClass(entry: TrafficEntry): StatusClassValue | null {
  const status = entry.responseStatus
  if (status == null || status < 100 || status >= 600) return null
  return `${Math.floor(status / 100)}xx` as StatusClassValue
}

export function entryMatchesTrafficFilters(
  entry: TrafficEntry,
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
  return true
}
