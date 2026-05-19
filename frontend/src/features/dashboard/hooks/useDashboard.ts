import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBreakpointState } from '../../breakpoints/hooks/useBreakpointState'
import { useOverrideEditorState } from '../../override-editor/hooks/useOverrideEditorState'
import { useSavedRequests } from '../../saved-requests/hooks/useSavedRequests'
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
import { isTauri } from '../../../lib/tauriEnv'
import { dashboardTexts } from '../texts'
import { useAppWebSocket } from './useAppWebSocket'

const FLOATING_TRAFFIC_WINDOW_LABEL = 'floating-traffic'
const FLOATING_TRAFFIC_VIEW_PATH = '/?view=floating-traffic'

export function useDashboard() {
  const [breakpointsOpen, setBreakpointsOpen] = useState(false)
  const openBreakpointsPanel = useCallback(() => setBreakpointsOpen(true), [])
  const closeBreakpointsPanel = useCallback(() => setBreakpointsOpen(false), [])
  const [savedRequestsOpen, setSavedRequestsOpen] = useState(false)
  const openSavedRequestsPanel = useCallback(() => setSavedRequestsOpen(true), [])
  const closeSavedRequestsPanel = useCallback(
    () => setSavedRequestsOpen(false),
    [],
  )
  const openFloatingTrafficWindow = useCallback(async () => {
    const floatingUrl = new URL(
      FLOATING_TRAFFIC_VIEW_PATH,
      window.location.href,
    ).toString()

    if (!isTauri()) {
      window.open(
        floatingUrl,
        FLOATING_TRAFFIC_WINDOW_LABEL,
        'popup,width=380,height=560',
      )
      return
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('open_floating_traffic_window')
    } catch (error) {
      window.alert(
        dashboardTexts.header.openFloatingTrafficFailed(
          error instanceof Error ? error.message : String(error),
        ),
      )
    }
  }, [])
  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>(
    'connecting',
  )
  const [mitmEnabled, setMitmEnabled] = useState(false)
  const [mitmCaPemPath, setMitmCaPemPath] = useState<string | null>(null)
  const [proxyListenAddress, setProxyListenAddress] = useState<string | null>(
    null,
  )

  const traffic = useTrafficState()
  const savedRequestsState = useSavedRequests()
  const {
    savedRequests,
    selectedSavedRequestId,
    setSelectedSavedRequestId,
    saveRequest,
    isRequestSaved,
    removeSavedRequest,
    clearSavedRequests,
  } = savedRequestsState
  const ovr = useOverrideEditorState()
  const {
    overrides,
    setOverrideError,
    setOverrideEditingId,
    setOverrideForm,
    bumpRequestPanel,
    setOverridesPanel,
    refreshOverrides,
  } = ovr
  const brk = useBreakpointState({ openBreakpointsPanel })
  const { breakpoints, setBreakpointForm, refreshBreakpoints } = brk

  const selectedIdRef = useRef<string | null>(null)

  useEffect(() => {
    selectedIdRef.current = traffic.selectedId
  }, [traffic.selectedId])

  useAppWebSocket({
    setEntries: traffic.setEntries,
    selectedIdRef,
    setSelectedId: traffic.setSelectedId,
    setWsStatus,
    refreshOverrides,
    refreshBreakpoints,
  })

  useEffect(() => {
    queueMicrotask(() => {
      void refreshOverrides()
      void refreshBreakpoints()
    })
  }, [refreshBreakpoints, refreshOverrides])

  useEffect(() => {
    if (!breakpointsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      closeBreakpointsPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [breakpointsOpen, closeBreakpointsPanel])

  useEffect(() => {
    if (!savedRequestsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      closeSavedRequestsPanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeSavedRequestsPanel, savedRequestsOpen])

  useEffect(() => {
    const loadHealth = async () => {
      try {
        const r = await fetch('/api/health')
        if (!r.ok) return
        const h = (await r.json()) as {
          mitmEnabled?: boolean
          mitmCaPemPath?: string | null
          proxyPort?: number
          proxyListenIpv4?: string | null
        }
        setMitmEnabled(Boolean(h.mitmEnabled))
        setMitmCaPemPath(
          typeof h.mitmCaPemPath === 'string' && h.mitmCaPemPath.length > 0
            ? h.mitmCaPemPath
            : null,
        )
        const ipv4 =
          typeof h.proxyListenIpv4 === 'string' &&
          /^\d{1,3}(\.\d{1,3}){3}$/.test(h.proxyListenIpv4)
            ? h.proxyListenIpv4
            : null
        if (
          ipv4 != null &&
          typeof h.proxyPort === 'number' &&
          Number.isFinite(h.proxyPort) &&
          h.proxyPort > 0 &&
          h.proxyPort <= 65535
        ) {
          setProxyListenAddress(`${ipv4}:${h.proxyPort}`)
        }
      } catch {
        /* ignore */
      }
    }
    void loadHealth()
  }, [])

  const { selected, entries, filteredEntries, urlFilterTrimmed } = traffic

  const selectedIsSaved = useMemo(
    () => Boolean(selected && isRequestSaved(selected.id)),
    [isRequestSaved, selected],
  )

  const saveSelectedRequest = useCallback(async () => {
    if (!selected) return
    try {
      await saveRequest(selected)
    } catch (e) {
      window.alert(String(e))
    }
  }, [saveRequest, selected])

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
    openBreakpointsPanel()
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
  }, [
    breakpoints,
    openBreakpointsPanel,
    refreshBreakpoints,
    selected,
    setBreakpointForm,
  ])

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
    proxyListenAddress,
    breakpointsOpen,
    savedRequestsOpen,
    closeBreakpointsPanel,
    openSavedRequestsPanel,
    openFloatingTrafficWindow,
    closeSavedRequestsPanel,
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
    selectedIsSaved,
    openOverrideDrawer,
    saveSelectedRequest,
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
    onBreakpointsNavClick: openBreakpointsPanel,
    savedRequests,
    selectedSavedRequestId,
    setSelectedSavedRequestId,
    removeSavedRequest,
    clearSavedRequests,
  }
}

export type DashboardViewModel = ReturnType<typeof useDashboard>
