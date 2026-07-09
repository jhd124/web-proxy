import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { showSuccessToast, showToast } from '../../../lib/toast'
import type {
  CatalogSuggestion,
  RequestCatalogTemplate,
  RequestComposerHistoryDetail,
  RequestComposerHistoryItem,
  RequestComposerRequest,
  RequestComposerResponse,
  RequestComposerSendResponse,
} from '../../../types'
import { requestComposerTexts as t } from '../texts'
import type {
  RequestComposerFormState,
  RequestComposerInitialRequest,
  RequestComposerViewModel,
} from '../types'

const HISTORY_PAGE_SIZE = 40
const DEFAULT_FORM: RequestComposerFormState = {
  url: '',
  method: 'GET',
  searchParamsText: '',
  headersText: '',
  body: '',
}
const CURL_OPTIONS_WITH_VALUE = new Set([
  '-A',
  '--cacert',
  '--cert',
  '--connect-timeout',
  '--cookie',
  '--cookie-jar',
  '--form',
  '--interface',
  '--key',
  '--max-time',
  '--output',
  '--proxy',
  '--referer',
  '--request-target',
  '--resolve',
  '--user',
  '--user-agent',
  '-b',
  '-e',
  '-F',
  '-m',
  '-o',
  '-u',
  '-x',
])

export type RequestComposerActions = {
  initialRequest?: RequestComposerInitialRequest
  onSaveHistoryRequest?: (detail: RequestComposerHistoryDetail) => Promise<void>
  onCreateHistoryOverride?: (detail: RequestComposerHistoryDetail) => Promise<void>
}

export function useRequestComposer(
  actions: RequestComposerActions = {},
): RequestComposerViewModel {
  const { initialRequest, onCreateHistoryOverride, onSaveHistoryRequest } = actions
  const [form, setForm] = useState<RequestComposerFormState>(DEFAULT_FORM)
  const [hostSuggestions, setHostSuggestions] = useState<CatalogSuggestion[]>([])
  const [pathSuggestions, setPathSuggestions] = useState<CatalogSuggestion[]>([])
  const [methodSuggestions, setMethodSuggestions] = useState<CatalogSuggestion[]>([])
  const [response, setResponse] = useState<RequestComposerResponse | null>(null)
  const [isSending, setIsSending] = useState(false)
  const [latestReusableRequest, setLatestReusableRequest] =
    useState<RequestComposerRequest | null>(null)
  const [history, setHistory] = useState<RequestComposerHistoryItem[]>([])
  const [selectedHistory, setSelectedHistory] =
    useState<RequestComposerHistoryDetail | null>(null)
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null)
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyLoading, setHistoryLoading] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const lastTemplateKeyRef = useRef('')
  const appliedInitialRequestKeyRef = useRef<string | null>(null)

  const setFormField = useCallback(
    (field: keyof RequestComposerFormState, value: string) => {
      if (field === 'url' && value.trim().length === 0) {
        setPathSuggestions([])
        setMethodSuggestions([])
      }
      setForm((current) => ({ ...current, [field]: value }))
    },
    [],
  )

  const target = useMemo(() => parseTargetUrl(form.url), [form.url])
  const requestBody = useMemo(() => formToRequest(form), [form])

  useEffect(() => {
    if (!initialRequest) return
    if (appliedInitialRequestKeyRef.current === initialRequest.key) return
    appliedInitialRequestKeyRef.current = initialRequest.key
    lastTemplateKeyRef.current = templateKeyForRequest(initialRequest.request)
    setForm(requestToForm(initialRequest.request))
    setResponse(null)
    setSelectedHistory(null)
    setSelectedHistoryId(null)
    setLatestReusableRequest(initialRequest.request)
  }, [initialRequest])

  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const hostPrefixes = buildHostPrefixes(target.hostPrefix)
      const queries = hostPrefixes.map((prefix) =>
        fetchSuggestions<CatalogSuggestion[]>(
          `/api/request-catalog/hosts?prefix=${encodeURIComponent(prefix)}&limit=12`,
          controller.signal,
        ),
      )
      void Promise.all(queries)
        .then((results) =>
          setHostSuggestions(
            mergeHostSuggestions(
              results.flat(),
              target.hostPrefix,
            ),
          ),
        )
        .catch((error: unknown) => {
          if (!isAbortError(error)) setHostSuggestions([])
        })
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [target.hostPrefix])

  useEffect(() => {
    const host = target.host
    if (!host) {
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({
        host,
        prefix: target.pathPrefix,
        limit: '12',
      })
      void fetchSuggestions<CatalogSuggestion[]>(
        `/api/request-catalog/paths?${query.toString()}`,
        controller.signal,
      )
        .then(setPathSuggestions)
        .catch((error: unknown) => {
          if (!isAbortError(error)) setPathSuggestions([])
        })
    }, 180)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [target.host, target.pathPrefix])

  useEffect(() => {
    const host = target.host
    const path = target.path
    if (!host || !path) {
      return
    }
    const controller = new AbortController()
    const query = new URLSearchParams({ host, path, limit: '8' })
    void fetchSuggestions<CatalogSuggestion[]>(
      `/api/request-catalog/methods?${query.toString()}`,
      controller.signal,
    )
      .then(setMethodSuggestions)
      .catch((error: unknown) => {
        if (!isAbortError(error)) setMethodSuggestions([])
      })
    return () => controller.abort()
  }, [target.host, target.path])

  useEffect(() => {
    const host = target.host
    const path = target.path
    const method = form.method.trim()
    if (!host || !path || !method) return
    const templateKey = `${host}\n${path}\n${method}`
    if (templateKey === lastTemplateKeyRef.current) return
    lastTemplateKeyRef.current = templateKey
    const controller = new AbortController()
    const query = new URLSearchParams({ host, path, method })
    void fetchSuggestions<RequestCatalogTemplate>(
      `/api/request-catalog/template?${query.toString()}`,
      controller.signal,
    )
      .then((template) => {
        setForm((current) => applyTemplate(current, template))
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          // Missing templates are expected while typing.
        }
      })
    return () => controller.abort()
  }, [target.host, target.path, form.method])

  const loadHistoryPage = useCallback(
    async (offset: number, mode: 'replace' | 'append') => {
      setHistoryLoading(true)
      try {
        const query = new URLSearchParams({
          limit: String(HISTORY_PAGE_SIZE),
          offset: String(offset),
          q: historyQuery,
        })
        const nextHistory = await fetchJson<RequestComposerHistoryItem[]>(
          `/api/request-composer/history?${query.toString()}`,
        )
        setHistory((current) =>
          mode === 'append' ? [...current, ...nextHistory] : nextHistory,
        )
        setHasMoreHistory(nextHistory.length === HISTORY_PAGE_SIZE)
        if (mode === 'replace') {
          const first = nextHistory[0] ?? null
          setSelectedHistoryId(first?.id ?? null)
          setSelectedHistory(null)
        }
      } catch (error) {
        showToast(t.historyLoadFailed(errorDetail(error)), 'error')
      } finally {
        setHistoryLoading(false)
      }
    },
    [historyQuery],
  )

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadHistoryPage(0, 'replace')
    }, 160)
    return () => window.clearTimeout(timer)
  }, [historyQuery, loadHistoryPage])

  const loadHistoryDetail = useCallback(async (id: string) => {
    return fetchJson<RequestComposerHistoryDetail>(
      `/api/request-composer/history/${encodeURIComponent(id)}`,
    )
  }, [])

  const selectHistory = useCallback(async (id: string) => {
    setSelectedHistoryId(id)
    try {
      const detail = await loadHistoryDetail(id)
      setSelectedHistory(detail)
      setLatestReusableRequest(detail.request)
      setResponse(detail.response)
    } catch (error) {
      showToast(t.historyLoadFailed(errorDetail(error)), 'error')
    }
  }, [loadHistoryDetail])

  const sendRequest = useCallback(async () => {
    setIsSending(true)
    setLatestReusableRequest(requestBody)
    try {
      const result = await fetchJson<RequestComposerSendResponse>(
        '/api/request-composer/send',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(requestBody),
        },
      )
      setResponse(result.response)
      showSuccessToast(t.sentSuccess)
      await loadHistoryPage(0, 'replace')
      setSelectedHistoryId(result.historyId)
      await selectHistory(result.historyId)
    } catch (error) {
      showToast(t.sentFailed(errorDetail(error)), 'error')
    } finally {
      setIsSending(false)
    }
  }, [loadHistoryPage, requestBody, selectHistory])

  const importCurlCommand = useCallback((command: string) => {
    try {
      const importedRequest = parseCurlCommand(command)
      setForm(requestToForm(importedRequest))
      setResponse(null)
      setLatestReusableRequest(importedRequest)
      showSuccessToast(t.curlImportSuccess)
      return true
    } catch (error) {
      showToast(t.curlImportFailed(errorDetail(error)), 'error')
      return false
    }
  }, [])

  const reuseSelectedHistory = useCallback(() => {
    const reusableRequest = selectedHistory?.request ?? latestReusableRequest
    if (!reusableRequest) return
    setForm(requestToForm(reusableRequest))
  }, [latestReusableRequest, selectedHistory])

  const saveHistoryRequest = useCallback(
    async (id: string) => {
      if (!onSaveHistoryRequest) return
      try {
        const detail = selectedHistory?.id === id ? selectedHistory : await loadHistoryDetail(id)
        await onSaveHistoryRequest(detail)
      } catch (error) {
        showToast(errorDetail(error), 'error')
      }
    },
    [loadHistoryDetail, onSaveHistoryRequest, selectedHistory],
  )

  const createHistoryOverride = useCallback(
    async (id: string) => {
      if (!onCreateHistoryOverride) return
      try {
        const detail = selectedHistory?.id === id ? selectedHistory : await loadHistoryDetail(id)
        await onCreateHistoryOverride(detail)
      } catch (error) {
        showToast(errorDetail(error), 'error')
      }
    },
    [loadHistoryDetail, onCreateHistoryOverride, selectedHistory],
  )

  const deleteSelectedHistory = useCallback(async () => {
    if (!selectedHistoryId) return
    try {
      await fetchJson<void>(
        `/api/request-composer/history/${encodeURIComponent(selectedHistoryId)}`,
        { method: 'DELETE' },
      )
      showSuccessToast(t.historyDeleted)
      await loadHistoryPage(0, 'replace')
    } catch (error) {
      showToast(errorDetail(error), 'error')
    }
  }, [loadHistoryPage, selectedHistoryId])

  const clearHistory = useCallback(async () => {
    try {
      await fetchJson<void>('/api/request-composer/history', { method: 'DELETE' })
      setHistory([])
      setSelectedHistory(null)
      setSelectedHistoryId(null)
      setLatestReusableRequest(null)
      setHasMoreHistory(false)
      showSuccessToast(t.historyCleared)
    } catch (error) {
      showToast(errorDetail(error), 'error')
    }
  }, [])

  const loadMoreHistory = useCallback(async () => {
    await loadHistoryPage(history.length, 'append')
  }, [history.length, loadHistoryPage])

  return {
    form,
    setFormField,
    hostSuggestions,
    pathSuggestions,
    methodSuggestions,
    response,
    isSending,
    isRequestTargetReady: target.host.length > 0,
    sendRequest,
    importCurlCommand,
    history,
    selectedHistory,
    selectedHistoryId,
    canReuseRequest: selectedHistory !== null || latestReusableRequest !== null,
    historyQuery,
    setHistoryQuery,
    selectHistory,
    reuseSelectedHistory,
    saveHistoryRequest,
    createHistoryOverride,
    deleteSelectedHistory,
    clearHistory,
    loadMoreHistory,
    hasMoreHistory,
    historyLoading,
  }
}

function buildHostPrefixes(hostPrefix: string): string[] {
  const normalizedPrefix = hostPrefix.trim().toLowerCase()
  if (!normalizedPrefix) return ['']
  if (normalizedPrefix.includes('.')) return [normalizedPrefix]
  if (normalizedPrefix.startsWith('www.')) return [normalizedPrefix, normalizedPrefix.slice(4)]
  return [normalizedPrefix, `www.${normalizedPrefix}`]
}

function mergeHostSuggestions(
  suggestions: CatalogSuggestion[],
  keyword: string,
): CatalogSuggestion[] {
  const deduplicatedMap = new Map<string, CatalogSuggestion>()
  suggestions.forEach((suggestion) => {
    if (!deduplicatedMap.has(suggestion.value)) {
      deduplicatedMap.set(suggestion.value, suggestion)
    }
  })
  const deduplicatedSuggestions = Array.from(deduplicatedMap.values())
  return rankHostSuggestions(deduplicatedSuggestions, keyword)
}

function rankHostSuggestions(
  suggestions: CatalogSuggestion[],
  keyword: string,
): CatalogSuggestion[] {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return suggestions
  return [...suggestions].sort((left, right) => {
    const leftValue = left.value.toLowerCase()
    const rightValue = right.value.toLowerCase()
    const leftStartsWithKeyword = leftValue.startsWith(normalizedKeyword)
    const rightStartsWithKeyword = rightValue.startsWith(normalizedKeyword)
    if (leftStartsWithKeyword !== rightStartsWithKeyword) {
      return leftStartsWithKeyword ? -1 : 1
    }
    const leftContainsKeyword = leftValue.includes(normalizedKeyword)
    const rightContainsKeyword = rightValue.includes(normalizedKeyword)
    if (leftContainsKeyword !== rightContainsKeyword) {
      return leftContainsKeyword ? -1 : 1
    }
    return 0
  })
}

async function fetchSuggestions<T>(url: string, signal: AbortSignal): Promise<T> {
  return fetchJson<T>(url, { signal })
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

function formToRequest(form: RequestComposerFormState): RequestComposerRequest {
  const target = parseTargetUrl(form.url)
  return {
    scheme: target.scheme,
    host: target.host,
    path: target.path,
    method: form.method,
    searchParams: [...target.searchParams, ...parsePairs(form.searchParamsText)],
    headers: parsePairs(form.headersText),
    body: form.body.trim().length > 0 ? form.body : null,
  }
}

function requestToForm(request: RequestComposerRequest): RequestComposerFormState {
  return {
    url: formatTargetUrl(request),
    method: request.method || 'GET',
    searchParamsText: formatPairs(request.searchParams),
    headersText: formatPairs(request.headers),
    body: request.body ?? '',
  }
}

function templateKeyForRequest(request: RequestComposerRequest): string {
  return `${request.host}\n${normalizePath(request.path)}\n${request.method.trim()}`
}

function parseCurlCommand(command: string): RequestComposerRequest {
  const tokens = tokenizeShellCommand(command.trim())
  if (tokens.length === 0 || tokens[0] !== 'curl') {
    throw new Error(t.curlImportInvalid)
  }

  let method = ''
  let url = ''
  const headers: [string, string][] = []
  const bodyParts: string[] = []

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token) continue

    if (token === '-X' || token === '--request') {
      method = requireCurlOptionValue(tokens, index, token).toUpperCase()
      index += 1
      continue
    }

    if (token.startsWith('-X') && token.length > 2) {
      method = token.slice(2).toUpperCase()
      continue
    }

    if (token === '--url') {
      url = requireCurlOptionValue(tokens, index, token)
      index += 1
      continue
    }

    if (token.startsWith('--url=')) {
      url = token.slice('--url='.length)
      continue
    }

    if (token === '-H' || token === '--header') {
      headers.push(parseCurlHeader(requireCurlOptionValue(tokens, index, token)))
      index += 1
      continue
    }

    if (token.startsWith('--header=')) {
      headers.push(parseCurlHeader(token.slice('--header='.length)))
      continue
    }

    if (token.startsWith('-H') && token.length > 2) {
      headers.push(parseCurlHeader(token.slice(2)))
      continue
    }

    if (isCurlDataOption(token)) {
      bodyParts.push(requireCurlOptionValue(tokens, index, token))
      index += 1
      continue
    }

    if (token.startsWith('--data=') || token.startsWith('--data-raw=')) {
      bodyParts.push(token.slice(token.indexOf('=') + 1))
      continue
    }

    if (isInlineCurlOptionWithValue(token)) {
      continue
    }

    if (CURL_OPTIONS_WITH_VALUE.has(token)) {
      index += 1
      continue
    }

    if (token.startsWith('-')) {
      continue
    }

    if (!url && isPotentialCurlUrl(token)) {
      url = token
    }
  }

  if (!url) {
    throw new Error(t.curlImportMissingUrl)
  }

  const parsedUrl = parseTargetUrl(url)
  if (!parsedUrl.host) {
    throw new Error(t.curlImportMissingUrl)
  }

  return {
    scheme: parsedUrl.scheme,
    host: parsedUrl.host,
    path: parsedUrl.path,
    method: method || (bodyParts.length > 0 ? 'POST' : 'GET'),
    searchParams: parsedUrl.searchParams,
    headers,
    body: bodyParts.length > 0 ? bodyParts.join('&') : null,
  }
}

function tokenizeShellCommand(command: string): string[] {
  const tokens: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let isEscaped = false

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index] ?? ''
    if (isEscaped) {
      if (char === '\n' || char === '\r') {
        isEscaped = false
        continue
      }
      current += char
      isEscaped = false
      continue
    }
    if (quote == null && char === '$' && command[index + 1] === "'") {
      quote = "'"
      index += 1
      continue
    }
    if (char === '\\' && quote !== "'") {
      isEscaped = true
      continue
    }
    if ((char === '"' || char === "'") && quote === char) {
      quote = null
      continue
    }
    if ((char === '"' || char === "'") && quote == null) {
      quote = char
      continue
    }
    if (/\s/.test(char) && quote == null) {
      if (current.length > 0) {
        tokens.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (isEscaped) current += '\\'
  if (quote != null) {
    throw new Error(t.curlImportUnclosedQuote)
  }
  if (current.length > 0) tokens.push(current)
  return tokens
}

function requireCurlOptionValue(tokens: string[], index: number, option: string): string {
  const value = tokens[index + 1]
  if (value == null) {
    throw new Error(t.curlImportMissingOptionValue(option))
  }
  return value
}

function parseCurlHeader(value: string): [string, string] {
  const separatorIndex = value.indexOf(':')
  if (separatorIndex <= 0) {
    throw new Error(t.curlImportInvalidHeader(value))
  }
  return [
    value.slice(0, separatorIndex).trim(),
    value.slice(separatorIndex + 1).trim(),
  ]
}

function isCurlDataOption(token: string): boolean {
  return (
    token === '-d' ||
    token === '--data' ||
    token === '--data-raw' ||
    token === '--data-binary' ||
    token === '--data-urlencode'
  )
}

function isInlineCurlOptionWithValue(token: string): boolean {
  const optionName = token.split('=', 1)[0] ?? ''
  return token.includes('=') && CURL_OPTIONS_WITH_VALUE.has(optionName)
}

function isPotentialCurlUrl(token: string): boolean {
  const value = token.trim()
  if (!value || value.includes(' ')) return false
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) return true
  if (/^(localhost|\d{1,3}(?:\.\d{1,3}){3})(:\d+)?([/?#].*)?$/i.test(value)) {
    return true
  }
  return /^[\w.-]+\.[a-z]{2,}(:\d+)?([/?#].*)?$/i.test(value)
}

type ParsedTargetUrl = {
  scheme: string
  host: string
  hostPrefix: string
  path: string
  pathPrefix: string
  searchParams: [string, string][]
}

function parseTargetUrl(value: string): ParsedTargetUrl {
  const trimmed = value.trim()
  const normalizedInput = hasScheme(trimmed) ? trimmed : `https://${trimmed}`
  const fallback = {
    scheme: 'https',
    host: '',
    hostPrefix: hostPrefixFromInput(trimmed),
    path: '/',
    pathPrefix: '/',
    searchParams: [],
  }

  if (!trimmed) return fallback

  try {
    const url = new URL(normalizedInput)
    const path = normalizePath(url.pathname)
    return {
      scheme: url.protocol.replace(':', '') || 'https',
      host: url.host.toLowerCase(),
      hostPrefix: url.host.toLowerCase(),
      path,
      pathPrefix: path,
      searchParams: Array.from(url.searchParams.entries()),
    }
  } catch {
    return fallback
  }
}

function formatTargetUrl(request: RequestComposerRequest): string {
  const scheme = request.scheme || 'https'
  const host = request.host.trim()
  const path = normalizePath(request.path)
  if (!host) return ''
  return `${scheme}://${host}${path}`
}

function hasScheme(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value)
}

function hostPrefixFromInput(value: string): string {
  return value.replace(/^[a-z][a-z\d+.-]*:\/\//i, '').split(/[/?#]/, 1)[0] ?? ''
}

function normalizePath(value: string): string {
  if (!value || value === '/') return '/'
  return value.startsWith('/') ? value : `/${value}`
}

function parsePairs(text: string): [string, string][] {
  return text
    .split('\n')
    .map((line): [string, string] | null => {
      const trimmed = line.trim()
      if (!trimmed) return null
      const [key, ...valueParts] = trimmed.split('=')
      const normalizedKey = key.trim()
      if (!normalizedKey) return null
      return [normalizedKey, valueParts.join('=').trim()]
    })
    .filter((pair): pair is [string, string] => pair !== null)
}

function formatPairs(pairs: [string, string][]): string {
  return pairs.map(([key, value]) => `${key}=${value}`).join('\n')
}

function applyTemplate(
  current: RequestComposerFormState,
  template: RequestCatalogTemplate,
): RequestComposerFormState {
  return {
    ...current,
    searchParamsText: template.searchParamsSchema
      .map((field) => `${field.key}=`)
      .join('\n'),
    headersText: formatPairs(template.headers),
    body: bodyFromTemplate(template),
  }
}

function bodyFromTemplate(template: RequestCatalogTemplate): string {
  const bodySchema = template.bodySchema
  if (!bodySchema) return ''
  if (bodySchema.kind === 'json' && bodySchema.fields.length > 0) {
    const value = Object.fromEntries(
      bodySchema.fields.map((field) => [field.key, emptyValueForType(field.valueType)]),
    )
    return JSON.stringify(value, null, 2)
  }
  if (bodySchema.kind === 'form') {
    return bodySchema.fields.map((field) => `${field.key}=`).join('&')
  }
  return ''
}

function emptyValueForType(valueType: string): unknown {
  if (valueType === 'number') return 0
  if (valueType === 'boolean') return false
  if (valueType === 'array') return []
  if (valueType === 'object') return {}
  return ''
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
