import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBreakpointState } from '../../breakpoints/hooks/useBreakpointState'
import { useOverrideEditorState } from '../../override-editor/hooks/useOverrideEditorState'
import { useTrafficState } from '../../traffic/hooks/useTrafficState'
import {
  breakpointMatches,
  escapeRegex,
  getDefaultOverrideForm,
  headersToText,
  urlMatchPartsForForm,
  urlOrigin,
} from '../../../lib/dashboardUtils'
import { trafficEntryMatchesOverride } from '../../../lib/overrideMatch'
import { useAppWebSocket } from './useAppWebSocket'

export function useDashboard() {
  const [tab, setTab] = useState<'traffic' | 'breakpoints'>('traffic')
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting',
  )
  const [mitmEnabled, setMitmEnabled] = useState(false)
  const [mitmCaPemPath, setMitmCaPemPath] = useState<string | null>(null)

  const traffic = useTrafficState()
  const ovr = useOverrideEditorState()
  const {
    overrides,
    setOverrideError,
    setOverrideEditingId,
    setOverrideForm,
    bumpRequestPanel,
    setOverridesPanel,
  } = ovr
  const brk = useBreakpointState({ setTab })
  const { breakpoints, setBreakpointForm, refreshBreakpoints } = brk

  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = traffic.selectedId

  useAppWebSocket({
    setEntries: traffic.setEntries,
    selectedIdRef,
    setSelectedId: traffic.setSelectedId,
    setWsStatus,
    refreshOverrides: ovr.refreshOverrides,
    refreshBreakpoints: brk.refreshBreakpoints,
  })

  useEffect(() => {
    queueMicrotask(() => {
      void ovr.refreshOverrides()
      void brk.refreshBreakpoints()
    })
  }, [brk.refreshBreakpoints, ovr.refreshOverrides])

  useEffect(() => {
    const loadHealth = async () => {
      try {
        const r = await fetch('/api/health')
        if (!r.ok) return
        const h = (await r.json()) as {
          mitmEnabled?: boolean
          mitmCaPemPath?: string | null
        }
        setMitmEnabled(Boolean(h.mitmEnabled))
        setMitmCaPemPath(
          typeof h.mitmCaPemPath === 'string' && h.mitmCaPemPath.length > 0
            ? h.mitmCaPemPath
            : null,
        )
      } catch {
        /* ignore */
      }
    }
    void loadHealth()
  }, [])

  const { selected, entries, filteredEntries, urlFilterTrimmed } = traffic

  const selectedMatchingOverride = useMemo(() => {
    if (!selected || selected.kind !== 'http') return null
    return (
      overrides.find(
        (o) => o.enabled && trafficEntryMatchesOverride(selected, o),
      ) ?? null
    )
  }, [overrides, selected])

  const selectedMatchingBreakpoint = useMemo(() => {
    if (!selected || selected.kind !== 'http') return null
    return (
      breakpoints.find((rule) => rule.enabled && breakpointMatches(rule, selected)) ??
      null
    )
  }, [breakpoints, selected])

  const selectedCanControlStream = Boolean(
    selected &&
      selected.kind === 'http' &&
      selectedMatchingBreakpoint &&
      selectedMatchingOverride?.streamIntervalMs != null &&
      selectedMatchingOverride?.id === ovr.overrideEditingId &&
      selected.streamControllable,
  )

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
  }, [breakpoints, refreshBreakpoints, selected, setBreakpointForm, setTab])

  const { addBreakpointFromOverride: addBreakpointFromOverrideApi } = brk
  const addBreakpointFromOverride = useCallback(
    (
      source: {
        name: string
        matchHost?: string | null
        matchPath?: string | null
      },
      originHint?: string,
    ) => {
      void addBreakpointFromOverrideApi(source, originHint)
    },
    [addBreakpointFromOverrideApi],
  )

  const openOverrideDrawer = useCallback(() => {
    if (!selected || selected.kind !== 'http') return
    setOverrideError(null)
    const m = urlMatchPartsForForm(selected)
    setOverrideEditingId(null)
    setOverrideForm({
      ...getDefaultOverrideForm(),
      status: selected.responseStatus ?? 200,
      body: selected.responseBodyPreview ?? '',
      headersText: headersToText(selected.responseHeaders ?? undefined),
      matchProtocol: m.matchProtocol,
      matchHost: m.matchHost,
      matchPath: m.matchPath,
      matchQuery: m.matchQuery,
    })
    bumpRequestPanel()
    setOverridesPanel({ state: 'edit', source: 'traffic' })
  }, [
    selected,
    bumpRequestPanel,
    setOverrideEditingId,
    setOverrideError,
    setOverrideForm,
    setOverridesPanel,
  ])

  return {
    wsStatus,
    urlFilterTrimmed,
    filteredCount: filteredEntries.length,
    totalCount: entries.length,
    mitmEnabled,
    mitmCaPemPath,
    tab,
    setTab,
    overrideCount: ovr.overrides.length,
    breakpointCount: brk.breakpoints.length,
    onOverridesNavClick: ovr.onOverridesNavClick,
    urlFilter: traffic.urlFilter,
    setUrlFilter: traffic.setUrlFilter,
    testError: traffic.testError,
    clearTraffic: traffic.clearTraffic,
    filteredEntries: traffic.filteredEntries,
    selectedId: traffic.selectedId,
    setSelectedId: traffic.setSelectedId,
    selected: traffic.selected,
    selectedIsEventStream: traffic.selectedIsEventStream,
    openOverrideDrawer,
    addBreakpointFromSelected,
    resumeRequest: traffic.resumeRequest,
    resumeSaving: traffic.resumeSaving,
    overridesPanel: ovr.overridesPanel,
    closeOverrideDrawer: ovr.closeOverrideDrawer,
    saveOverride: ovr.saveOverride,
    overrideError: ovr.overrideError,
    requestPanelFocusKey: ovr.requestPanelFocusKey,
    bumpRequestPanel: ovr.bumpRequestPanel,
    overrideFileInputRef: ovr.overrideFileInputRef,
    overrideForm: ovr.overrideForm,
    setOverrideForm: ovr.setOverrideForm,
    overrideEntries: ovr.overrides,
    startNewOverride: ovr.startNewOverride,
    openOverrideEditorForKey: ovr.openOverrideEditorForKey,
    overrideToggleSaving: ovr.overrideToggleSaving,
    setOverrideEnabled: ovr.setOverrideEnabled,
    deleteOverrideRule: ovr.deleteOverrideRule,
    computedOverrideId: ovr.computedOverrideId,
    selectedMatchingOverride,
    overrideEditingId: ovr.overrideEditingId,
    selectedCanControlStream,
    addBreakpointFromOverride,
    streamActionSaving: traffic.streamActionSaving,
    playControlledStream: traffic.playControlledStream,
    pauseControlledStream: traffic.pauseControlledStream,
    breakpointForm: brk.breakpointForm,
    setBreakpointForm: brk.setBreakpointForm,
    breakpointEntries: brk.breakpoints,
    addBreakpoint: brk.addBreakpoint,
    removeBreakpoint: brk.removeBreakpoint,
    setBreakpointEnabled: brk.setBreakpointEnabled,
    breakpointToggleSaving: brk.breakpointToggleSaving,
  }
}

export type DashboardViewModel = ReturnType<typeof useDashboard>
