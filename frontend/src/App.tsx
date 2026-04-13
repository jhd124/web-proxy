import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import type {
  BreakpointRule,
  MockRule,
  OverrideRule,
  TrafficEntry,
  WsMessage,
} from './types'

const wsUrl = () => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function headersToText(headers: [string, string][] | null | undefined): string {
  if (!headers?.length) return ''
  return headers.map(([k, v]) => `${k}: ${v}`).join('\n')
}

function parseHeadersText(text: string): [string, string][] {
  const out: [string, string][] = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t) continue
    const i = t.indexOf(':')
    if (i <= 0) continue
    out.push([t.slice(0, i).trim(), t.slice(i + 1).trim()])
  }
  return out
}

function urlOrigin(u: string): string {
  try {
    return new URL(u).origin
  } catch {
    return ''
  }
}

function inferOriginFromHostHint(hostHint: string | null | undefined): string {
  const value = (hostHint ?? '').trim()
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://')) return value
  return ''
}

function breakpointMatches(rule: BreakpointRule, entry: TrafficEntry): boolean {
  const origin = urlOrigin(entry.url)
  if (rule.matchOrigin && rule.matchOrigin.toLowerCase() !== origin.toLowerCase()) {
    return false
  }
  if (!rule.matchPathRegex) return true
  try {
    return new RegExp(rule.matchPathRegex).test(entry.path)
  } catch {
    return false
  }
}

function App() {
  const [entries, setEntries] = useState<TrafficEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting',
  )
  const [tab, setTab] = useState<'traffic' | 'mocks' | 'overrides' | 'breakpoints'>(
    'traffic',
  )
  const [testError, setTestError] = useState<string | null>(null)
  const [mitmEnabled, setMitmEnabled] = useState(false)
  const [urlFilter, setUrlFilter] = useState('')

  const [mocks, setMocks] = useState<MockRule[]>([])
  const [overrides, setOverrides] = useState<OverrideRule[]>([])
  const [breakpoints, setBreakpoints] = useState<BreakpointRule[]>([])
  const [overrideBodyDrafts, setOverrideBodyDrafts] = useState<
    Record<string, string>
  >({})
  const [overrideBodySaving, setOverrideBodySaving] = useState<
    Record<string, boolean>
  >({})
  const [overrideToggleSaving, setOverrideToggleSaving] = useState<
    Record<string, boolean>
  >({})
  const [breakpointToggleSaving, setBreakpointToggleSaving] = useState<
    Record<string, boolean>
  >({})
  const [resumeSaving, setResumeSaving] = useState<Record<string, boolean>>({})
  const [mockForm, setMockForm] = useState({
    name: 'My mock',
    matchMethod: '',
    matchHost: '',
    matchPathRegex: '',
    status: 200,
    body: '{"hello":"world"}',
    headerKey: 'content-type',
    headerVal: 'application/json',
  })
  const [breakpointForm, setBreakpointForm] = useState({
    name: 'Pause API request',
    matchOrigin: '',
    matchPathRegex: '^/api/',
  })

  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [overrideEditingId, setOverrideEditingId] = useState<string | null>(null)
  const [streamActionSaving, setStreamActionSaving] = useState<
    Record<string, boolean>
  >({})
  const [overrideForm, setOverrideForm] = useState({
    name: '',
    enabled: true,
    status: 200,
    body: '',
    headersText: '',
    matchMethod: '',
    matchHost: '',
    matchPathRegex: '',
    streamEnabled: false,
    streamIntervalMs: 500,
  })

  const refreshMocks = useCallback(async () => {
    const r = await fetch('/api/mocks')
    if (r.ok) setMocks(await r.json())
  }, [])

  const refreshOverrides = useCallback(async () => {
    const r = await fetch('/api/overrides')
    if (r.ok) setOverrides(await r.json())
  }, [])

  const refreshBreakpoints = useCallback(async () => {
    const r = await fetch('/api/breakpoints')
    if (r.ok) setBreakpoints(await r.json())
  }, [])

  useEffect(() => {
    setOverrideBodyDrafts((prev) => {
      const next: Record<string, string> = {}
      for (const override of overrides) {
        next[override.id] = prev[override.id] ?? override.body
      }
      return next
    })
  }, [overrides])

  useEffect(() => {
    let ws: WebSocket | null = null
    let alive = true

    const syncFromServer = async () => {
      try {
        const r = await fetch('/api/requests')
        if (!r.ok) return
        const list = (await r.json()) as TrafficEntry[]
        setEntries(list)
      } catch {
        /* ignore */
      }
    }

    const connect = () => {
      if (!alive) return
      setWsStatus('connecting')
      ws = new WebSocket(wsUrl())
      ws.onopen = () => {
        setWsStatus('open')
        void syncFromServer()
      }
      ws.onclose = () => {
        setWsStatus('closed')
        if (alive) setTimeout(connect, 1500)
      }
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as WsMessage
          if (msg.type === 'snapshot') {
            setEntries(msg.requests)
            if (msg.requests.length && !selectedId) {
              setSelectedId(msg.requests[msg.requests.length - 1]!.id)
            }
          } else if (msg.type === 'traffic') {
            setEntries((prev) => {
              const i = prev.findIndex((e) => e.id === msg.entry.id)
              if (i >= 0) {
                const next = [...prev]
                next[i] = msg.entry
                return next
              }
              const next = [...prev, msg.entry]
              if (next.length > 2000) next.splice(0, next.length - 2000)
              return next
            })
          } else if (msg.type === 'mock_updated') {
            void refreshMocks()
          } else if (msg.type === 'overrides_updated') {
            void refreshOverrides()
          } else if (msg.type === 'breakpoints_updated') {
            void refreshBreakpoints()
          }
        } catch {
          /* ignore */
        }
      }
    }

    connect()
    return () => {
      alive = false
      ws?.close()
    }
    // WebSocket should only connect once; omit selectedId to avoid reconnect churn
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [refreshBreakpoints, refreshMocks, refreshOverrides])

  useEffect(() => {
    queueMicrotask(() => {
      void refreshMocks()
      void refreshOverrides()
      void refreshBreakpoints()
    })
  }, [refreshBreakpoints, refreshMocks, refreshOverrides])

  useEffect(() => {
    const loadHealth = async () => {
      try {
        const r = await fetch('/api/health')
        if (!r.ok) return
        const h = (await r.json()) as { mitmEnabled?: boolean }
        setMitmEnabled(Boolean(h.mitmEnabled))
      } catch {
        /* ignore */
      }
    }
    void loadHealth()
  }, [])

  const urlFilterTrimmed = urlFilter.trim()
  const filteredEntries = useMemo(() => {
    if (!urlFilterTrimmed) return entries
    const q = urlFilterTrimmed.toLowerCase()
    return entries.filter((e) => e.url.toLowerCase().includes(q))
  }, [entries, urlFilterTrimmed])

  const selected = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  )
  const selectedMatchingOverride = useMemo(() => {
    if (!selected || selected.kind !== 'http') return null
    return (
      overrides.find(
        (o) =>
          o.enabled &&
          (o.matchMethod ?? '').toLowerCase() === selected.method.toLowerCase() &&
          (o.matchHost ?? '') === selected.host &&
          (o.matchPathRegex ?? '') === `^${escapeRegex(selected.path)}$`,
      ) ?? null
    )
  }, [overrides, selected])
  const selectedMatchingBreakpoint = useMemo(() => {
    if (!selected || selected.kind !== 'http') return null
    return breakpoints.find((rule) => rule.enabled && breakpointMatches(rule, selected)) ?? null
  }, [breakpoints, selected])

  const selectedResponseContentType = useMemo(() => {
    if (!selected?.responseHeaders) return ''
    const h = selected.responseHeaders.find(
      ([k]) => k.toLowerCase() === 'content-type',
    )
    return h?.[1]?.toLowerCase() ?? ''
  }, [selected])

  const selectedIsEventStream =
    selectedResponseContentType.includes('text/event-stream')
  const selectedCanControlStream = Boolean(
    selected &&
      selected.kind === 'http' &&
      selectedMatchingBreakpoint &&
      selectedMatchingOverride?.streamIntervalMs != null &&
      selectedMatchingOverride?.id === overrideEditingId &&
      selected.streamControllable,
  )

  const overrideEntries = overrides
  const breakpointEntries = breakpoints

  const addMock = async () => {
    const headers: [string, string][] = []
    if (mockForm.headerKey.trim()) {
      headers.push([mockForm.headerKey.trim(), mockForm.headerVal])
    }
    const r = await fetch('/api/mocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: mockForm.name,
        enabled: true,
        matchMethod: mockForm.matchMethod || null,
        matchHost: mockForm.matchHost || null,
        matchPathRegex: mockForm.matchPathRegex || null,
        status: mockForm.status,
        headers,
        body: mockForm.body,
        streamIntervalMs: null,
      }),
    })
    if (r.ok) {
      await refreshMocks()
      setTab('mocks')
    }
  }

  const removeMock = async (id: string) => {
    await fetch(`/api/mocks/${id}`, { method: 'DELETE' })
    await refreshMocks()
  }

  const addBreakpoint = async () => {
    const r = await fetch('/api/breakpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: breakpointForm.name.trim() || 'Breakpoint',
        enabled: true,
        matchOrigin: breakpointForm.matchOrigin.trim() || null,
        matchPathRegex: breakpointForm.matchPathRegex.trim() || null,
      }),
    })
    if (r.ok) {
      await refreshBreakpoints()
      setTab('breakpoints')
    }
  }

  const removeBreakpoint = useCallback(
    async (id: string) => {
      const r = await fetch(`/api/breakpoints/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(`Delete failed (HTTP ${r.status})`)
      await refreshBreakpoints()
    },
    [refreshBreakpoints],
  )

  const setBreakpointEnabled = useCallback(
    async (rule: BreakpointRule, enabled: boolean) => {
      setBreakpointToggleSaving((prev) => ({ ...prev, [rule.id]: true }))
      try {
        const r = await fetch(`/api/breakpoints/${rule.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: rule.name,
            enabled,
            matchOrigin: rule.matchOrigin ?? null,
            matchPathRegex: rule.matchPathRegex ?? null,
          }),
        })
        if (!r.ok) throw new Error(`Update failed (HTTP ${r.status})`)
        await refreshBreakpoints()
      } catch (e) {
        window.alert(String(e))
      } finally {
        setBreakpointToggleSaving((prev) => ({ ...prev, [rule.id]: false }))
      }
    },
    [refreshBreakpoints],
  )

  const clearTraffic = async () => {
    await fetch('/api/requests', { method: 'DELETE' })
    setEntries([])
    setSelectedId(null)
  }

  const resumeRequest = useCallback(async (id: string) => {
    setResumeSaving((prev) => ({ ...prev, [id]: true }))
    try {
      const r = await fetch(`/api/requests/${id}/resume`, { method: 'POST' })
      if (!r.ok) throw new Error(`Resume failed (HTTP ${r.status})`)
    } catch (e) {
      window.alert(String(e))
    } finally {
      setResumeSaving((prev) => ({ ...prev, [id]: false }))
    }
  }, [])

  const playControlledStream = useCallback(async (id: string) => {
    setStreamActionSaving((prev) => ({ ...prev, [id]: true }))
    try {
      const r = await fetch(`/api/requests/${id}/stream/play`, { method: 'POST' })
      if (!r.ok) throw new Error(`Play failed (HTTP ${r.status})`)
    } catch (e) {
      window.alert(String(e))
    } finally {
      setStreamActionSaving((prev) => ({ ...prev, [id]: false }))
    }
  }, [])

  const pauseControlledStream = useCallback(async (id: string) => {
    setStreamActionSaving((prev) => ({ ...prev, [id]: true }))
    try {
      const r = await fetch(`/api/requests/${id}/stream/pause`, { method: 'POST' })
      if (!r.ok) throw new Error(`Pause failed (HTTP ${r.status})`)
    } catch (e) {
      window.alert(String(e))
    } finally {
      setStreamActionSaving((prev) => ({ ...prev, [id]: false }))
    }
  }, [])

  const sendTestProxy = async () => {
    setTestError(null)
    try {
      const r = await fetch('/api/self-test', { method: 'POST' })
      const j = (await r.json()) as { ok?: boolean; error?: string }
      if (!r.ok || !j.ok) {
        setTestError(j.error ?? `HTTP ${r.status}`)
      }
    } catch (e) {
      setTestError(String(e))
    }
  }

  const addBreakpointFromSelected = useCallback(async () => {
    if (!selected || selected.kind !== 'http') return
    const matchOrigin = urlOrigin(selected.url)
    const matchPathRegex = `^${escapeRegex(selected.path)}$`
    const existing = breakpoints.find(
      (rule) =>
        (rule.matchOrigin ?? '') === matchOrigin &&
        (rule.matchPathRegex ?? '') === matchPathRegex,
    )
    setBreakpointForm({
      name: `Pause ${selected.method} ${selected.path}`,
      matchOrigin,
      matchPathRegex,
    })
    setTab('breakpoints')
    if (existing) {
      return
    }
    const r = await fetch('/api/breakpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: `Pause ${selected.method} ${selected.path}`,
        enabled: true,
        matchOrigin: matchOrigin || null,
        matchPathRegex,
      }),
    })
    if (r.ok) {
      await refreshBreakpoints()
    }
  }, [breakpoints, refreshBreakpoints, selected])

  const addBreakpointFromOverride = useCallback(
    async (
      source: {
        name: string
        matchHost?: string | null
        matchPathRegex?: string | null
      },
      originHint?: string,
    ) => {
      const matchOrigin =
        originHint || inferOriginFromHostHint(source.matchHost) || ''
      const matchPathRegex = source.matchPathRegex ?? ''
      setBreakpointForm({
        name: `Pause ${source.name}`,
        matchOrigin,
        matchPathRegex,
      })
      setTab('breakpoints')
      if (!matchOrigin || !matchPathRegex) {
        return
      }
      const existing = breakpoints.find(
        (rule) =>
          (rule.matchOrigin ?? '') === matchOrigin &&
          (rule.matchPathRegex ?? '') === matchPathRegex,
      )
      if (existing) {
        return
      }
      const r = await fetch('/api/breakpoints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Pause ${source.name}`,
          enabled: true,
          matchOrigin,
          matchPathRegex,
        }),
      })
      if (r.ok) {
        await refreshBreakpoints()
      }
    },
    [breakpoints, refreshBreakpoints],
  )

  const openOverrideDrawer = useCallback(() => {
    if (!selected || selected.kind !== 'http') return
    setOverrideError(null)
    const matchPathRegex = `^${escapeRegex(selected.path)}$`
    const existing = overrides.find(
      (o) =>
        (o.matchMethod ?? '') === selected.method &&
        (o.matchHost ?? '') === selected.host &&
        (o.matchPathRegex ?? '') === matchPathRegex,
    )
    if (existing) {
      setOverrideEditingId(existing.id)
      setOverrideForm({
        name: existing.name,
        enabled: existing.enabled,
        status: existing.status,
        body: existing.body,
        headersText: headersToText(existing.headers),
        matchMethod: existing.matchMethod ?? '',
        matchHost: existing.matchHost ?? '',
        matchPathRegex: existing.matchPathRegex ?? '',
        streamEnabled: existing.streamIntervalMs != null,
        streamIntervalMs: existing.streamIntervalMs ?? 500,
      })
    } else {
      setOverrideEditingId(null)
      setOverrideForm({
        name: `Override ${selected.method} ${selected.host}`,
        enabled: true,
        status: selected.responseStatus ?? 200,
        body: selected.responseBodyPreview ?? '',
        headersText: headersToText(selected.responseHeaders ?? undefined),
        matchMethod: selected.method,
        matchHost: selected.host,
        matchPathRegex: `^${escapeRegex(selected.path)}$`,
        streamEnabled: false,
        streamIntervalMs: 500,
      })
    }
    setOverrideOpen(true)
  }, [selected, overrides])

  const closeOverrideDrawer = useCallback(() => {
    setOverrideOpen(false)
    setOverrideError(null)
  }, [])

  const openOverrideEditorForKey = useCallback(
    (override: OverrideRule) => {
      setOverrideError(null)
      setOverrideEditingId(override.id)
      setOverrideForm({
        name: override.name,
        enabled: override.enabled,
        status: override.status,
        body: override.body,
        headersText: headersToText(override.headers),
        matchMethod: override.matchMethod ?? '',
        matchHost: override.matchHost ?? '',
        matchPathRegex: override.matchPathRegex ?? '',
        streamEnabled: override.streamIntervalMs != null,
        streamIntervalMs: override.streamIntervalMs ?? 500,
      })
      setOverrideOpen(true)
    },
    [],
  )

  const deleteOverrideRule = useCallback(
    async (id: string) => {
      const r = await fetch(`/api/overrides/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(`Delete failed (HTTP ${r.status})`)
      await refreshOverrides()
    },
    [refreshOverrides],
  )

  const saveOverrideBody = useCallback(
    async (override: OverrideRule) => {
      const body = overrideBodyDrafts[override.id] ?? override.body
      setOverrideBodySaving((prev) => ({ ...prev, [override.id]: true }))
      try {
        const r = await fetch(`/api/overrides/${override.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: override.name,
            enabled: override.enabled,
            matchMethod: override.matchMethod ?? null,
            matchHost: override.matchHost ?? null,
            matchPathRegex: override.matchPathRegex ?? null,
            status: override.status,
            headers: override.headers,
            body,
            streamIntervalMs: override.streamIntervalMs ?? null,
          }),
        })
        if (!r.ok) throw new Error(`Save failed (HTTP ${r.status})`)
        await refreshOverrides()
      } catch (e) {
        window.alert(String(e))
      } finally {
        setOverrideBodySaving((prev) => ({ ...prev, [override.id]: false }))
      }
    },
    [overrideBodyDrafts, refreshOverrides],
  )

  const setOverrideEnabled = useCallback(
    async (override: OverrideRule, enabled: boolean) => {
      setOverrideToggleSaving((prev) => ({ ...prev, [override.id]: true }))
      try {
        const r = await fetch(`/api/overrides/${override.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: override.name,
            enabled,
            matchMethod: override.matchMethod ?? null,
            matchHost: override.matchHost ?? null,
            matchPathRegex: override.matchPathRegex ?? null,
            status: override.status,
            headers: override.headers,
            body: overrideBodyDrafts[override.id] ?? override.body,
            streamIntervalMs: override.streamIntervalMs ?? null,
          }),
        })
        if (!r.ok) throw new Error(`Update failed (HTTP ${r.status})`)
        await refreshOverrides()
      } catch (e) {
        window.alert(String(e))
      } finally {
        setOverrideToggleSaving((prev) => ({ ...prev, [override.id]: false }))
      }
    },
    [overrideBodyDrafts, refreshOverrides],
  )

  const saveOverride = useCallback(async () => {
    setOverrideError(null)
    const headers = parseHeadersText(overrideForm.headersText)
    const streamIntervalMs = overrideForm.streamEnabled
      ? Math.max(0, Number(overrideForm.streamIntervalMs) || 500)
      : null
    const payload = {
      name: overrideForm.name.trim() || 'Override',
      enabled: overrideForm.enabled,
      matchMethod: overrideForm.matchMethod || null,
      matchHost: overrideForm.matchHost || null,
      matchPathRegex: overrideForm.matchPathRegex || null,
      status: overrideForm.status,
      headers,
      body: overrideForm.body,
      streamIntervalMs,
    }
    try {
      if (overrideEditingId) {
        const r = await fetch(`/api/overrides/${overrideEditingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) throw new Error(`Save failed (HTTP ${r.status})`)
      } else {
        const r = await fetch('/api/overrides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) throw new Error(`Save failed (HTTP ${r.status})`)
        const rule = (await r.json()) as OverrideRule
        setOverrideEditingId(rule.id)
      }
      await refreshOverrides()
      setOverrideOpen(false)
    } catch (e) {
      setOverrideError(String(e))
    }
  }, [overrideEditingId, overrideForm, refreshOverrides])

  useEffect(() => {
    if (!overrideOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeOverrideDrawer()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overrideOpen, closeOverrideDrawer])

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="dot" />
          <h1>Proxy dashboard</h1>
        </div>
        <div className="meta">
          <span
            className={`pill ${wsStatus === 'open' ? 'ok' : wsStatus === 'connecting' ? 'warn' : 'bad'}`}
          >
            WS {wsStatus}
          </span>
          <span className="pill subtle">
            {urlFilterTrimmed
              ? `${filteredEntries.length} / ${entries.length} shown`
              : `${entries.length} captured`}
          </span>
          <code className="hint">
            export HTTP_PROXY=http://127.0.0.1:8080 HTTPS_PROXY=http://127.0.0.1:8080
          </code>
        </div>
      </header>

      {mitmEnabled && (
        <div className="mitm-banner">
          <strong>HTTPS decryption (MITM) is on.</strong> Install the local CA so browsers
          trust proxied TLS: open{' '}
          <a href="/api/mitm/ca.pem" download="proxy-mitm-ca.pem">
            /api/mitm/ca.pem
          </a>{' '}
          and add it to your system keychain (macOS: Keychain Access → import → always trust).
          Then restart the browser. Without the CA, HTTPS sites will show certificate errors.
        </div>
      )}

      <nav className="tabs">
        <button
          type="button"
          className={tab === 'traffic' ? 'on' : ''}
          onClick={() => setTab('traffic')}
        >
          Traffic
        </button>
        <button
          type="button"
          className={tab === 'mocks' ? 'on' : ''}
          onClick={() => setTab('mocks')}
        >
          Mock rules
        </button>
        <button
          type="button"
          className={tab === 'overrides' ? 'on' : ''}
          onClick={() => setTab('overrides')}
        >
          Overrides
          {overrideEntries.length > 0 && (
            <span className="tab-count">{overrideEntries.length}</span>
          )}
        </button>
        <button
          type="button"
          className={tab === 'breakpoints' ? 'on' : ''}
          onClick={() => setTab('breakpoints')}
        >
          Breakpoints
          {breakpointEntries.length > 0 && (
            <span className="tab-count">{breakpointEntries.length}</span>
          )}
        </button>
      </nav>

      {tab === 'traffic' && (
        <div className="grid">
          <aside className="list-panel">
            <div className="list-tools">
              <button type="button" className="primary" onClick={sendTestProxy}>
                Test proxy
              </button>
              <button type="button" className="ghost" onClick={clearTraffic}>
                Clear
              </button>
              <label className="list-filter">
                <span className="sr-only">Filter by URL substring</span>
                <input
                  type="search"
                  value={urlFilter}
                  onChange={(e) => setUrlFilter(e.target.value)}
                  placeholder="Filter URL…"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </div>
            {testError && (
              <p className="small err" style={{ margin: '0 0 8px 0' }}>
                {testError}
              </p>
            )}
            <ul className="req-list">
              {[...filteredEntries].reverse().map((e) => {
                const schemeLabel =
                  e.kind === 'connect' ? 'HTTPS' : e.scheme.toUpperCase()
                const summary =
                  e.kind === 'connect' ? `${e.url} (TLS tunnel)` : e.url
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={selectedId === e.id ? 'row active' : 'row'}
                      onClick={() => setSelectedId(e.id)}
                    >
                      <span className="scheme">{schemeLabel}</span>
                      <span className="m">{e.method}</span>
                      <span className="u" title={summary}>
                        {summary}
                      </span>
                      {e.pending && <span className="tag warn">pending</span>}
                      {e.mocked && <span className="tag">mock</span>}
                      {e.responseStatus != null && (
                        <span className="s">{e.responseStatus}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          <main className="detail">
            {selected ? (
              <>
                <section className="block">
                  <h2>Request</h2>
                  <p className="mono small">
                    {selected.method} {selected.url}
                  </p>
                  <p className="small muted">
                    client {selected.peer ?? '—'} · {selected.kind} ·{' '}
                    {selected.scheme} ·{' '}
                    {selected.durationMs != null ? `${selected.durationMs} ms` : '…'}
                  </p>
                  {selected.pending && (
                    <p className="small warn-text">
                      Pending at breakpoint
                      {selected.breakpointName ? `: ${selected.breakpointName}` : ''}. The
                      client is waiting for you to resume this request.
                    </p>
                  )}
                  {selected.kind === 'connect' && (
                    <p className="small muted">
                      HTTPS uses a CONNECT tunnel; paths and bodies inside TLS are not
                      visible to the proxy.
                    </p>
                  )}
                  <pre className="pre">
                    {selected.requestHeaders.map(([k, v]) => `${k}: ${v}\n`).join('')}
                  </pre>
                  {selected.requestBodyPreview && (
                    <>
                      <h3>Body</h3>
                      <pre className="pre">{selected.requestBodyPreview}</pre>
                    </>
                  )}
                </section>
                <section className="block">
                  <div className="block-head">
                    <h2>Response</h2>
                    <div className="detail-actions">
                      {selected.kind === 'http' && (
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => void addBreakpointFromSelected()}
                        >
                          Add breakpoint
                        </button>
                      )}
                      {selected.pending && !selected.streamControllable && (
                        <button
                          type="button"
                          className="primary inline-primary"
                          disabled={resumeSaving[selected.id] === true}
                          onClick={() => void resumeRequest(selected.id)}
                        >
                          {resumeSaving[selected.id] ? 'Resuming…' : 'Resume'}
                        </button>
                      )}
                      {selected.kind === 'http' && (
                        <button
                          type="button"
                          className="ghost"
                          onClick={openOverrideDrawer}
                        >
                          Override response
                        </button>
                      )}
                    </div>
                  </div>
                  {selected.pending && !selected.responseStatus && !selected.error && (
                    <p className="small muted">
                      No response yet because this request is paused before override or upstream
                      handling.
                    </p>
                  )}
                  {selected.error && (
                    <p className="err">{selected.error}</p>
                  )}
                  {selected.responseStatus != null && (
                    <p className="mono">HTTP {selected.responseStatus}</p>
                  )}
                  {selected.responseHeaders && (
                    <pre className="pre">
                      {selected.responseHeaders.map(([k, v]) => `${k}: ${v}\n`).join('')}
                    </pre>
                  )}
                  {selectedIsEventStream && !selected.responseBodyPreview && (
                    <p className="small muted" style={{ marginTop: '8px' }}>
                      Streaming response — body fills in as chunks arrive (retained up to ~64
                      MB for the dashboard).
                    </p>
                  )}
                  {selected.responseBodyPreview && (
                    <>
                      <h3>Body</h3>
                      {selectedIsEventStream && (
                        <p className="small muted">
                          Full streamed body retained for this view (up to ~64 MB). Updates
                          while the connection stays open; the last chunk is shown when the
                          stream ends.
                        </p>
                      )}
                      <pre className="pre pre-body">{selected.responseBodyPreview}</pre>
                    </>
                  )}
                </section>
              </>
            ) : (
              <div className="muted">
                <p>
                  This list shows <strong>every HTTP request</strong> and{' '}
                  <strong>every HTTPS CONNECT tunnel</strong> that clients send through
                  this proxy. Only traffic routed via{' '}
                  <code>HTTP_PROXY</code>/<code>HTTPS_PROXY</code> or a system proxy
                  appears here — not other programs on the machine.
                </p>
                <p>
                  Select a row, use <strong>Test proxy</strong>, or point a client at
                  the proxy (browsers need OS proxy settings or an extension; shell{' '}
                  <code>export</code> alone does not affect them).
                </p>
              </div>
            )}
          </main>
        </div>
      )}

      {overrideOpen && (
        <div
          className="drawer-backdrop"
          role="presentation"
          onClick={closeOverrideDrawer}
        >
          <div
            className="drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="override-drawer-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-head">
              <h2 id="override-drawer-title">Override response</h2>
              <button
                type="button"
                className="ghost drawer-close"
                onClick={closeOverrideDrawer}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="small muted drawer-intro">
              Future requests that match the rule below receive this response
              instead of the upstream (plain HTTP only; first matching mock wins).
            </p>
            {overrideError && (
              <p className="small err" style={{ marginBottom: '0.75rem' }}>
                {overrideError}
              </p>
            )}
            <div className="drawer-form">
              <label>
                Name
                <input
                  value={overrideForm.name}
                  onChange={(e) =>
                    setOverrideForm((f) => ({ ...f, name: e.target.value }))
                  }
                />
              </label>
              <label className="wide stream-toggle">
                <span className="stream-toggle-row">
                  <input
                    type="checkbox"
                    checked={overrideForm.enabled}
                    onChange={(e) =>
                      setOverrideForm((f) => ({
                        ...f,
                        enabled: e.target.checked,
                      }))
                    }
                  />
                  <span>Enable this override rule</span>
                </span>
              </label>
              <label>
                Match method
                <input
                  value={overrideForm.matchMethod}
                  onChange={(e) =>
                    setOverrideForm((f) => ({
                      ...f,
                      matchMethod: e.target.value,
                    }))
                  }
                  placeholder="GET"
                />
              </label>
              <label>
                Host contains
                <input
                  value={overrideForm.matchHost}
                  onChange={(e) =>
                    setOverrideForm((f) => ({
                      ...f,
                      matchHost: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="wide">
                Path regex
                <input
                  className="mono"
                  value={overrideForm.matchPathRegex}
                  onChange={(e) =>
                    setOverrideForm((f) => ({
                      ...f,
                      matchPathRegex: e.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Status
                <input
                  type="number"
                  value={overrideForm.status}
                  onChange={(e) =>
                    setOverrideForm((f) => ({
                      ...f,
                      status: Number(e.target.value) || 200,
                    }))
                  }
                />
              </label>
              <label className="wide">
                Response headers (one <code>Name: value</code> per line)
                <textarea
                  rows={5}
                  className="mono"
                  spellCheck={false}
                  value={overrideForm.headersText}
                  onChange={(e) =>
                    setOverrideForm((f) => ({
                      ...f,
                      headersText: e.target.value,
                    }))
                  }
                />
              </label>
              <label className="wide stream-toggle">
                <span className="stream-toggle-row">
                  <input
                    type="checkbox"
                    checked={overrideForm.streamEnabled}
                    onChange={(e) =>
                      setOverrideForm((f) => ({
                        ...f,
                        streamEnabled: e.target.checked,
                      }))
                    }
                  />
                  <span>
                    Stream response body (separate messages with a blank line; set{' '}
                    <code>Content-Type: text/event-stream</code> in headers if needed)
                  </span>
                </span>
              </label>
              <label className="wide">
                Body
                <span className="small muted" style={{ display: 'block', marginBottom: '0.35rem' }}>
                  {overrideForm.streamEnabled
                    ? 'Split on double newlines (blank line). Each streamed chunk is prefixed with two newlines for SSE-style framing; empty segments send only those two newlines.'
                    : 'Response body sent as one piece unless streaming is enabled above.'}
                </span>
                <textarea
                  rows={12}
                  spellCheck={false}
                  value={overrideForm.body}
                  onChange={(e) =>
                    setOverrideForm((f) => ({ ...f, body: e.target.value }))
                  }
                />
              </label>
              {selectedCanControlStream && selected && (
                <div className="stream-preview-section">
                  <label>
                    Interval between chunks (ms)
                    <input
                      type="number"
                      min={0}
                      step={50}
                      value={overrideForm.streamIntervalMs}
                      onChange={(e) =>
                        setOverrideForm((f) => ({
                          ...f,
                          streamIntervalMs: Number(e.target.value) || 0,
                        }))
                      }
                    />
                  </label>
                  <div className="stream-preview-controls">
                    <span className="small muted">Stream controller</span>
                    <div className="stream-preview-btns">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => void playControlledStream(selected.id)}
                        disabled={
                          streamActionSaving[selected.id] === true ||
                          selected.streamPlaying === true
                        }
                      >
                        Play
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => void pauseControlledStream(selected.id)}
                        disabled={
                          streamActionSaving[selected.id] === true ||
                          selected.streamPlaying !== true
                        }
                      >
                        Stop
                      </button>
                    </div>
                  </div>
                  <pre className="pre stream-preview-out mono tiny">
                    {streamActionSaving[selected.id] === true
                      ? 'Updating stream controller...'
                      : selected.pending
                        ? 'Request is paused at the breakpoint. Press Play to start streaming the override response.'
                        : selected.streamPlaying
                          ? 'Streaming override response is running. Press Stop to pause after the current chunk.'
                          : 'Streaming override response is paused. Press Play to continue.'}
                  </pre>
                </div>
              )}
            </div>
            <div className="drawer-actions">
              {selected?.pending &&
                selectedMatchingOverride?.id === overrideEditingId && (
                  <button
                    type="button"
                    className="primary inline-primary"
                    disabled={resumeSaving[selected.id] === true}
                    onClick={() => void resumeRequest(selected.id)}
                  >
                    {resumeSaving[selected.id] ? 'Resuming…' : 'Resume request'}
                  </button>
                )}
              <button
                type="button"
                className="ghost"
                onClick={() =>
                  void addBreakpointFromOverride(
                    {
                      name: overrideForm.name.trim() || 'Override',
                      matchHost: overrideForm.matchHost || null,
                      matchPathRegex: overrideForm.matchPathRegex || null,
                    },
                    selectedMatchingOverride?.id === overrideEditingId && selected
                      ? urlOrigin(selected.url)
                      : undefined,
                  )
                }
              >
                Add breakpoint
              </button>
              <button
                type="button"
                className="ghost"
                onClick={closeOverrideDrawer}
              >
                Cancel
              </button>
              <button type="button" className="primary" onClick={saveOverride}>
                {overrideEditingId ? 'Save changes' : 'Save override'}
              </button>
            </div>
          </div>
        </div>
      )}

      {tab === 'overrides' && (
        <div className="mocks overrides-tab">
          <p className="muted intro">
            Overrides are stored in SQLite and applied before in-memory mock rules. Use{' '}
            <strong>Traffic → Override response</strong> to create one from a captured request,
            then manage it here.
          </p>
          {overrideEntries.length === 0 ? (
            <p className="muted">
              No overrides yet. Open <strong>Traffic</strong>, select an HTTP request, and
              use <strong>Override response</strong> in the detail panel.
            </p>
          ) : (
            <ul className="mock-list">
              {overrideEntries.map((override) => (
                  <li
                    key={override.id}
                    className={`mock-card ${override.enabled ? '' : 'is-disabled'}`}
                  >
                    <div className="mock-head">
                      <strong>
                        {override.name}{' '}
                        {!override.enabled && (
                          <span className="pill subtle">disabled</span>
                        )}
                      </strong>
                      <div className="override-actions">
                        <button
                          type="button"
                          className="ghost"
                          disabled={overrideToggleSaving[override.id] === true}
                          onClick={() =>
                            void setOverrideEnabled(override, !override.enabled)
                          }
                        >
                          {overrideToggleSaving[override.id]
                            ? 'Saving…'
                            : override.enabled
                              ? 'Disable'
                              : 'Enable'}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => openOverrideEditorForKey(override)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() =>
                            void addBreakpointFromOverride(
                              override,
                              selectedMatchingOverride?.id === override.id && selected
                                ? urlOrigin(selected.url)
                                : undefined,
                            )
                          }
                        >
                          Add breakpoint
                        </button>
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => {
                            if (
                              !window.confirm(
                                'Delete this override from SQLite?',
                              )
                            ) {
                              return
                            }
                            void deleteOverrideRule(override.id).catch((e) => {
                              window.alert(String(e))
                            })
                          }}
                        >
                          Delete rule
                        </button>
                      </div>
                    </div>
                    <p className="small mono override-sig">
                      <span className="tag-sig">{override.matchMethod ?? '∗'}</span>{' '}
                      {override.matchHost ?? '∗'}
                      <span className="path-sig">{override.matchPathRegex ?? '∗'}</span>
                    </p>
                    <p className="tiny muted">
                      Override id: <code>{override.id}</code>
                    </p>
                    <p className="small mono">
                      HTTP {override.status}
                    </p>
                    {override.streamIntervalMs != null && (
                      <p className="tiny muted">
                        Streamed: {override.streamIntervalMs} ms between chunks (body split
                        on blank lines)
                      </p>
                    )}
                    <label className="override-body-editor">
                      <span className="tiny muted">
                        {override.streamIntervalMs != null
                          ? 'Stream body content'
                          : 'Response body content'}
                      </span>
                      <textarea
                        rows={Math.max(
                          5,
                          Math.min(
                            14,
                            (overrideBodyDrafts[override.id] ?? override.body).split(
                              '\n',
                            ).length + 1,
                          ),
                        )}
                        className="mono"
                        spellCheck={false}
                        value={overrideBodyDrafts[override.id] ?? override.body}
                        onChange={(e) =>
                          setOverrideBodyDrafts((prev) => ({
                            ...prev,
                            [override.id]: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <div className="override-inline-actions">
                      <button
                        type="button"
                        className="ghost"
                        disabled={
                          overrideBodySaving[override.id] === true ||
                          overrideToggleSaving[override.id] === true ||
                          (overrideBodyDrafts[override.id] ?? override.body) ===
                            override.body
                        }
                        onClick={() =>
                          setOverrideBodyDrafts((prev) => ({
                            ...prev,
                            [override.id]: override.body,
                          }))
                        }
                      >
                        Reset
                      </button>
                      <button
                        type="button"
                        className="primary inline-primary"
                        disabled={
                          overrideBodySaving[override.id] === true ||
                          overrideToggleSaving[override.id] === true
                        }
                        onClick={() => void saveOverrideBody(override)}
                      >
                        {overrideBodySaving[override.id] ? 'Saving…' : 'Save content'}
                      </button>
                    </div>
                  </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'breakpoints' && (
        <div className="mocks">
          <p className="muted intro">
            Breakpoints pause matching HTTP requests before overrides, mocks, or upstream fetches.
            When a request is pending, resume it from the request detail view or from the
            matching override drawer.
          </p>

          <div className="mock-form">
            <label>
              Name
              <input
                value={breakpointForm.name}
                onChange={(e) =>
                  setBreakpointForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </label>
            <label className="wide">
              Origin
              <input
                className="mono"
                placeholder="https://example.com"
                value={breakpointForm.matchOrigin}
                onChange={(e) =>
                  setBreakpointForm((f) => ({
                    ...f,
                    matchOrigin: e.target.value,
                  }))
                }
              />
            </label>
            <label className="wide">
              Path regex
              <input
                className="mono"
                placeholder="^/api/"
                value={breakpointForm.matchPathRegex}
                onChange={(e) =>
                  setBreakpointForm((f) => ({
                    ...f,
                    matchPathRegex: e.target.value,
                  }))
                }
              />
            </label>
            <button type="button" className="primary" onClick={addBreakpoint}>
              Add breakpoint
            </button>
          </div>

          {breakpointEntries.length === 0 ? (
            <p className="muted">No breakpoints yet.</p>
          ) : (
            <ul className="mock-list">
              {breakpointEntries.map((rule) => (
                <li
                  key={rule.id}
                  className={`mock-card ${rule.enabled ? '' : 'is-disabled'}`}
                >
                  <div className="mock-head">
                    <strong>
                      {rule.name}{' '}
                      {!rule.enabled && <span className="pill subtle">disabled</span>}
                    </strong>
                    <div className="override-actions">
                      <button
                        type="button"
                        className="ghost"
                        disabled={breakpointToggleSaving[rule.id] === true}
                        onClick={() =>
                          void setBreakpointEnabled(rule, !rule.enabled)
                        }
                      >
                        {breakpointToggleSaving[rule.id]
                          ? 'Saving…'
                          : rule.enabled
                            ? 'Disable'
                            : 'Enable'}
                      </button>
                      <button
                        type="button"
                        className="ghost danger"
                        onClick={() => {
                          if (!window.confirm('Delete this breakpoint rule?')) {
                            return
                          }
                          void removeBreakpoint(rule.id).catch((e) => {
                            window.alert(String(e))
                          })
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="small mono">
                    {rule.matchOrigin ?? '∗'}
                    <br />
                    {rule.matchPathRegex ?? '∗'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === 'mocks' && (
        <div className="mocks">
          <p className="muted intro">
            Rules are checked in order. A rule matches when it is enabled and every
            non-empty field matches (method exact, host substring, path regex).
            First match wins and returns your status, headers, and body — no upstream
            call for plain HTTP.
          </p>

          <div className="mock-form">
            <label>
              Name
              <input
                value={mockForm.name}
                onChange={(e) =>
                  setMockForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </label>
            <label>
              Method (optional)
              <input
                placeholder="GET"
                value={mockForm.matchMethod}
                onChange={(e) =>
                  setMockForm((f) => ({ ...f, matchMethod: e.target.value }))
                }
              />
            </label>
            <label>
              Host contains (optional)
              <input
                placeholder="example.com"
                value={mockForm.matchHost}
                onChange={(e) =>
                  setMockForm((f) => ({ ...f, matchHost: e.target.value }))
                }
              />
            </label>
            <label>
              Path regex (optional)
              <input
                placeholder="^/api/"
                value={mockForm.matchPathRegex}
                onChange={(e) =>
                  setMockForm((f) => ({ ...f, matchPathRegex: e.target.value }))
                }
              />
            </label>
            <label>
              Status
              <input
                type="number"
                value={mockForm.status}
                onChange={(e) =>
                  setMockForm((f) => ({
                    ...f,
                    status: Number(e.target.value) || 200,
                  }))
                }
              />
            </label>
            <label>
              Header (optional)
              <div className="pair">
                <input
                  placeholder="name"
                  value={mockForm.headerKey}
                  onChange={(e) =>
                    setMockForm((f) => ({ ...f, headerKey: e.target.value }))
                  }
                />
                <input
                  placeholder="value"
                  value={mockForm.headerVal}
                  onChange={(e) =>
                    setMockForm((f) => ({ ...f, headerVal: e.target.value }))
                  }
                />
              </div>
            </label>
            <label className="wide">
              Body
              <textarea
                rows={6}
                value={mockForm.body}
                onChange={(e) =>
                  setMockForm((f) => ({ ...f, body: e.target.value }))
                }
              />
            </label>
            <button type="button" className="primary" onClick={addMock}>
              Add mock rule
            </button>
          </div>

          <ul className="mock-list">
            {mocks.map((m) => (
              <li key={m.id} className="mock-card">
                <div className="mock-head">
                  <strong>{m.name}</strong>
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => removeMock(m.id)}
                  >
                    Delete
                  </button>
                </div>
                <p className="small mono">
                  {m.matchMethod ?? '∗'} · {m.matchHost ?? '∗'} ·{' '}
                  {m.matchPathRegex ?? '∗'} → {m.status}
                </p>
                <pre className="pre tiny">{m.body}</pre>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default App
