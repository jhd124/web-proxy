import type { TrafficEntry } from '@/types'

type HarHeader = {
  name: string
  value: string
}

type HarQuery = {
  name: string
  value: string
}

type HarPostData = {
  mimeType: string
  text: string
}

type HarRequest = {
  method: string
  url: string
  httpVersion: string
  cookies: []
  headers: HarHeader[]
  queryString: HarQuery[]
  headersSize: number
  bodySize: number
  postData?: HarPostData
}

type HarContent = {
  size: number
  mimeType: string
  text?: string
}

type HarResponse = {
  status: number
  statusText: string
  httpVersion: string
  cookies: []
  headers: HarHeader[]
  content: HarContent
  redirectURL: string
  headersSize: number
  bodySize: number
}

type HarTimings = {
  send: number
  wait: number
  receive: number
}

type HarEntry = {
  startedDateTime: string
  time: number
  request: HarRequest
  response: HarResponse
  cache: Record<string, never>
  timings: HarTimings
}

type HarLog = {
  version: '1.2'
  creator: {
    name: string
    version: string
  }
  entries: HarEntry[]
}

export type HarDocument = {
  log: HarLog
}

function toHarHeaders(headers: [string, string][]): HarHeader[] {
  return headers.map(([name, value]) => ({ name, value }))
}

function toHarQueryString(urlValue: string): HarQuery[] {
  try {
    const url = new URL(urlValue)
    return Array.from(url.searchParams.entries()).map(([name, value]) => ({
      name,
      value,
    }))
  } catch {
    return []
  }
}

function estimateBodySize(body: string | null | undefined): number {
  if (!body) return 0
  return new TextEncoder().encode(body).length
}

function headerValue(headers: [string, string][], targetName: string): string {
  return (
    headers.find(([name]) => name.toLowerCase() === targetName.toLowerCase())?.[1] ??
    ''
  )
}

function toHarRequest(entry: TrafficEntry): HarRequest {
  const requestBody = entry.requestBodyPreview ?? ''
  const requestHeaders = entry.requestHeaders ?? []
  const contentType = headerValue(requestHeaders, 'content-type')
  const requestBodySize = estimateBodySize(requestBody)
  const shouldIncludePostData = requestBody.length > 0

  return {
    method: entry.method,
    url: entry.url,
    httpVersion: 'HTTP/1.1',
    cookies: [],
    headers: toHarHeaders(requestHeaders),
    queryString: toHarQueryString(entry.url),
    headersSize: -1,
    bodySize: requestBodySize,
    ...(shouldIncludePostData
      ? {
          postData: {
            mimeType: contentType || 'application/octet-stream',
            text: requestBody,
          },
        }
      : {}),
  }
}

function toHarResponse(entry: TrafficEntry): HarResponse {
  const responseHeaders = entry.responseHeaders ?? []
  const responseBody = entry.responseBodyPreview ?? ''
  const responseBodySize = estimateBodySize(responseBody)
  const contentType = headerValue(responseHeaders, 'content-type')
  const redirectURL = headerValue(responseHeaders, 'location')

  return {
    status: entry.responseStatus ?? 0,
    statusText: entry.error ?? '',
    httpVersion: 'HTTP/1.1',
    cookies: [],
    headers: toHarHeaders(responseHeaders),
    content: {
      size: responseBodySize,
      mimeType: contentType || 'application/octet-stream',
      ...(responseBody.length > 0 ? { text: responseBody } : {}),
    },
    redirectURL,
    headersSize: -1,
    bodySize: responseBodySize,
  }
}

function toHarEntry(entry: TrafficEntry): HarEntry {
  const durationMs = Number.isFinite(entry.durationMs) ? Number(entry.durationMs) : 0
  const waitTime = durationMs > 0 ? durationMs : 0

  return {
    startedDateTime: entry.at,
    time: waitTime,
    request: toHarRequest(entry),
    response: toHarResponse(entry),
    cache: {},
    timings: {
      send: 0,
      wait: waitTime,
      receive: 0,
    },
  }
}

export function trafficEntriesToHar(entries: TrafficEntry[]): HarDocument {
  return {
    log: {
      version: '1.2',
      creator: {
        name: 'proxy-dashboard',
        version: '1.0.0',
      },
      entries: entries.map(toHarEntry),
    },
  }
}
