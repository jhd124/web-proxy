import { textActionTexts } from './texts'

const MAX_DECODE_DEPTH = 5
const MAX_URL_RECURSION_DEPTH = 20

export type DecodeFormatKind =
  | 'base64'
  | 'json'
  | 'jwt'
  | 'unknown'
  | 'url'
  | 'urlComponent'

export type DecodeFormatResult = {
  kind: DecodeFormatKind
  label: string
  input: string
  output: string
}

type JwtPayload = {
  header: unknown
  payload: unknown
  signature: string
}

type FormattedUrl = {
  url: string
  origin: string
  pathname: string
  params: Record<string, UrlParamValue>
}

type UrlParamValue = string | FormattedUrl | UrlParamValue[]

export function decodeAndFormatText(input: string): DecodeFormatResult {
  const normalizedInput = input.trim()
  if (!normalizedInput) {
    return buildResult('unknown', input, textActionTexts.decodeFormat.empty)
  }

  const jsonValue = tryParseJson(normalizedInput)
  if (jsonValue.ok) {
    return buildResult('json', input, formatJson(jsonValue.value))
  }

  const jwtValue = tryDecodeJwt(normalizedInput)
  if (jwtValue.ok) {
    return buildResult('jwt', input, formatJson(jwtValue.value))
  }

  const urlValue = tryFormatUrl(normalizedInput)
  if (urlValue.ok) {
    return buildResult('url', input, formatJson(urlValue.value))
  }

  const urlComponentValue = tryDecodeUrlComponent(normalizedInput)
  if (urlComponentValue.ok) {
    const decodedUrlValue = tryFormatUrl(urlComponentValue.value)
    if (decodedUrlValue.ok) {
      return buildResult('url', input, formatJson(decodedUrlValue.value))
    }

    return buildResult('urlComponent', input, urlComponentValue.value)
  }

  const base64Value = tryDecodeBase64(normalizedInput)
  if (base64Value.ok) {
    const decodedJsonValue = tryParseJson(base64Value.value)
    const output = decodedJsonValue.ok ? formatJson(decodedJsonValue.value) : base64Value.value
    return buildResult('base64', input, output)
  }

  return buildResult('unknown', input, normalizedInput)
}

function buildResult(
  kind: DecodeFormatKind,
  input: string,
  output: string,
): DecodeFormatResult {
  return {
    kind,
    label: textActionTexts.decodeFormat.kindLabels[kind],
    input,
    output,
  }
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function tryParseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) as unknown }
  } catch {
    return { ok: false }
  }
}

function tryDecodeJwt(value: string): { ok: true; value: JwtPayload } | { ok: false } {
  const parts = value.split('.')
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return { ok: false }
  }

  const headerText = tryDecodeBase64(parts[0], true)
  const payloadText = tryDecodeBase64(parts[1], true)
  if (!headerText.ok || !payloadText.ok) {
    return { ok: false }
  }

  const header = tryParseJson(headerText.value)
  const payload = tryParseJson(payloadText.value)
  if (!header.ok || !payload.ok) {
    return { ok: false }
  }

  return {
    ok: true,
    value: {
      header: header.value,
      payload: payload.value,
      signature: parts[2],
    },
  }
}

function tryFormatUrl(
  value: string,
  visitedUrls = new Set<string>(),
  depth = 0,
): { ok: true; value: FormattedUrl } | { ok: false } {
  if (depth > MAX_URL_RECURSION_DEPTH || visitedUrls.has(value)) {
    return { ok: false }
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { ok: false }
  }

  if (!parsed.search) {
    return { ok: false }
  }

  const nextVisitedUrls = new Set(visitedUrls)
  nextVisitedUrls.add(value)

  const params: Record<string, UrlParamValue> = {}
  parsed.searchParams.forEach((rawValue, rawKey) => {
    const key = loopDecode(rawKey, true)
    const value = parseUrlParamValue(rawValue, nextVisitedUrls, depth + 1)
    appendParamValue(params, key, value)
  })

  return {
    ok: true,
    value: {
      url: loopDecode(parsed.href, false),
      origin: parsed.origin,
      pathname: loopDecode(parsed.pathname, false),
      params,
    },
  }
}

function parseUrlParamValue(
  value: string,
  visitedUrls: Set<string>,
  depth: number,
): UrlParamValue {
  let currentValue = value
  for (let index = 0; index <= MAX_DECODE_DEPTH; index += 1) {
    const nestedUrl = tryFormatUrl(currentValue, visitedUrls, depth)
    if (nestedUrl.ok) {
      return nestedUrl.value
    }

    try {
      const nextValue = decodeURIComponent(currentValue.replace(/\+/g, ' '))
      if (nextValue === currentValue) {
        return loopDecode(value, true)
      }
      currentValue = nextValue
    } catch {
      return loopDecode(value, true)
    }
  }

  return loopDecode(value, true)
}

function appendParamValue(
  params: Record<string, UrlParamValue>,
  key: string,
  value: UrlParamValue,
): void {
  const currentValue = params[key]
  if (currentValue === undefined) {
    params[key] = value
    return
  }
  if (Array.isArray(currentValue)) {
    currentValue.push(value)
    return
  }
  params[key] = [currentValue, value]
}

function tryDecodeUrlComponent(value: string): { ok: true; value: string } | { ok: false } {
  if (!/%[0-9a-f]{2}/i.test(value) && !value.includes('+')) {
    return { ok: false }
  }

  const decoded = loopDecode(value, true)
  if (decoded === value) {
    return { ok: false }
  }

  return { ok: true, value: decoded }
}

function loopDecode(value: string, shouldDecodePlus: boolean): string {
  let currentValue = shouldDecodePlus ? value.replace(/\+/g, ' ') : value
  for (let index = 0; index < MAX_DECODE_DEPTH; index += 1) {
    try {
      const nextValue = decodeURIComponent(currentValue)
      if (nextValue === currentValue) {
        return nextValue
      }
      currentValue = nextValue
    } catch {
      return currentValue
    }
  }
  return currentValue
}

function tryDecodeBase64(
  value: string,
  allowBase64Url = false,
): { ok: true; value: string } | { ok: false } {
  if (/\s/.test(value)) {
    return { ok: false }
  }

  const hasBase64UrlChars = /[-_]/.test(value)
  if (hasBase64UrlChars && !allowBase64Url) {
    return { ok: false }
  }

  if (!/^[A-Za-z0-9+/=_-]+$/.test(value) || value.length < 4) {
    return { ok: false }
  }

  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  if (normalized.length % 4 === 1) {
    return { ok: false }
  }

  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  try {
    const binary = atob(padded)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (!decoded.trim()) {
      return { ok: false }
    }
    return { ok: true, value: decoded }
  } catch {
    return { ok: false }
  }
}
