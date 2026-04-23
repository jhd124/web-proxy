import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { BreakpointsPanel } from './components/BreakpointsPanel'
import { DashboardHeader } from './components/DashboardHeader'
import { DashboardNav } from './components/DashboardNav'
import { MitmBanner } from './components/MitmBanner'
import { MockRulesPanel } from './components/MockRulesPanel'
import { OverrideEditorOverlay } from './components/OverrideEditorOverlay'
import { TrafficPanel } from './components/TrafficPanel'
import {
  breakpointMatches,
  escapeRegex,
  getDefaultOverrideForm,
  headersToText,
  inferOriginFromHostHint,
  parseHeadersText,
  urlOrigin,
  wsUrl,
} from './lib/dashboardUtils'
import type {
  BreakpointRule,
  MockRule,
  OverrideFormState,
  OverrideRule,
  TrafficEntry,
  WsMessage,
} from './types'

function App() {
  const [entries, setEntries] = useState<TrafficEntry[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting',
  )
  const [tab, setTab] = useState<'traffic' | 'mocks' | 'breakpoints'>('traffic')
  const [overridesPanel, setOverridesPanel] = useState<
    { state: 'closed' } | { state: 'edit'; source: 'nav' | 'traffic' }
  >({ state: 'closed' })
  const [overrideLeftTool, setOverrideLeftTool] = useState<'files' | 'info'>('info')
  const overrideFileInputRef = useRef<HTMLInputElement | null>(null)
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

  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [overrideEditingId, setOverrideEditingId] = useState<string | null>(null)
  const [streamActionSaving, setStreamActionSaving] = useState<
    Record<string, boolean>
  >({})
  const [overrideForm, setOverrideForm] = useState<OverrideFormState>(getDefaultOverrideForm)

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
    setOverrideLeftTool('info')
    setOverridesPanel({ state: 'edit', source: 'traffic' })
  }, [selected, overrides])

  const openOverridesFromNav = useCallback(() => {
    setOverrideError(null)
    setOverrideForm(getDefaultOverrideForm())
    setOverrideEditingId(null)
    setOverrideLeftTool('files')
    setOverridesPanel({ state: 'edit', source: 'nav' })
  }, [])

  const startNewOverride = useCallback(() => {
    setOverrideError(null)
    setOverrideForm(getDefaultOverrideForm())
    setOverrideEditingId(null)
    setOverrideLeftTool('info')
  }, [])

  const closeOverrideDrawer = useCallback(() => {
    setOverrideError(null)
    setOverridesPanel({ state: 'closed' })
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
      setOverrideLeftTool('info')
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
      setOverridesPanel((p) => {
        if (p.state === 'edit' && p.source === 'nav') {
          return { state: 'edit', source: 'nav' }
        }
        return { state: 'closed' }
      })
    } catch (e) {
      setOverrideError(String(e))
    }
  }, [overrideEditingId, overrideForm, refreshOverrides])

  useEffect(() => {
    if (overridesPanel.state === 'closed') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (overridesPanel.state === 'edit') {
        closeOverrideDrawer()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overridesPanel, closeOverrideDrawer])

  const onAddBreakpointForListOverride = useCallback(
    (override: OverrideRule) => {
      void addBreakpointFromOverride(
        override,
        selectedMatchingOverride?.id === override.id && selected
          ? urlOrigin(selected.url)
          : undefined,
      )
    },
    [addBreakpointFromOverride, selected, selectedMatchingOverride],
  )

  const onOverridesNavClick = useCallback(() => {
    setOverrideError(null)
    if (overridesPanel.state === 'edit' && overridesPanel.source === 'nav') {
      setOverrideLeftTool('files')
      return
    }
    openOverridesFromNav()
  }, [overridesPanel, openOverridesFromNav])

  return (
    <div className="app">
      <DashboardHeader
        wsStatus={wsStatus}
        urlFilterTrimmed={urlFilterTrimmed}
        filteredCount={filteredEntries.length}
        totalCount={entries.length}
      />

      {mitmEnabled && <MitmBanner />}

      <DashboardNav
        tab={tab}
        setTab={setTab}
        overrideCount={overrideEntries.length}
        breakpointCount={breakpointEntries.length}
        onOverridesClick={onOverridesNavClick}
      />

      {tab === 'traffic' && (
        <TrafficPanel
          urlFilter={urlFilter}
          setUrlFilter={setUrlFilter}
          testError={testError}
          sendTestProxy={sendTestProxy}
          clearTraffic={clearTraffic}
          filteredEntries={filteredEntries}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          selected={selected}
          selectedIsEventStream={selectedIsEventStream}
          openOverrideDrawer={openOverrideDrawer}
          addBreakpointFromSelected={addBreakpointFromSelected}
          resumeRequest={resumeRequest}
          resumeSaving={resumeSaving}
        />
      )}

      {overridesPanel.state === 'edit' && (
        <OverrideEditorOverlay
          closeOverrideDrawer={closeOverrideDrawer}
          saveOverride={saveOverride}
          overrideError={overrideError}
          overrideLeftTool={overrideLeftTool}
          setOverrideLeftTool={setOverrideLeftTool}
          overrideFileInputRef={overrideFileInputRef}
          overrideForm={overrideForm}
          setOverrideForm={setOverrideForm}
          overrideEntries={overrideEntries}
          startNewOverride={startNewOverride}
          openOverrideEditorForKey={openOverrideEditorForKey}
          onAddBreakpointForListOverride={onAddBreakpointForListOverride}
          overrideBodyDrafts={overrideBodyDrafts}
          setOverrideBodyDrafts={setOverrideBodyDrafts}
          overrideBodySaving={overrideBodySaving}
          overrideToggleSaving={overrideToggleSaving}
          setOverrideEnabled={setOverrideEnabled}
          saveOverrideBody={saveOverrideBody}
          deleteOverrideRule={deleteOverrideRule}
          selected={selected}
          selectedMatchingOverride={selectedMatchingOverride}
          overrideEditingId={overrideEditingId}
          selectedCanControlStream={selectedCanControlStream}
          resumeRequest={resumeRequest}
          resumeSaving={resumeSaving}
          addBreakpointFromOverride={addBreakpointFromOverride}
          streamActionSaving={streamActionSaving}
          playControlledStream={playControlledStream}
          pauseControlledStream={pauseControlledStream}
        />
      )}


      {tab === 'breakpoints' && (
        <BreakpointsPanel
          breakpointForm={breakpointForm}
          setBreakpointForm={setBreakpointForm}
          breakpointEntries={breakpointEntries}
          addBreakpoint={addBreakpoint}
          removeBreakpoint={removeBreakpoint}
          setBreakpointEnabled={setBreakpointEnabled}
          breakpointToggleSaving={breakpointToggleSaving}
        />
      )}

      {tab === 'mocks' && (
        <MockRulesPanel
          mockForm={mockForm}
          setMockForm={setMockForm}
          mocks={mocks}
          addMock={addMock}
          removeMock={removeMock}
        />
      )}
    </div>
  )
}

export default App
