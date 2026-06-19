import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBreakpointState } from '../../breakpoints/hooks/useBreakpointState'
import { useOverrideEditorState } from '../../override-editor/hooks/useOverrideEditorState'
import { useSavedRequests } from '../../saved-requests/hooks/useSavedRequests'
import { useTrafficState } from '../../traffic/hooks/useTrafficState'
import {
  breakpointMatches,
  getDefaultOverrideForm,
  headersToText,
  trafficEntryOrigin,
  urlMatchPartsForForm,
} from '../../../lib/dashboardUtils'
import { trafficEntryMatchesOverride } from '../../../lib/overrideMatch'
import { useMainWindowTrafficSelect } from '../../../lib/useMainWindowTrafficSelect'
import { isTauri } from '../../../lib/tauriEnv'
import { downloadBlob } from '../../../lib/download'
import { trafficEntriesToHar } from '../../../lib/har'
import { copyTextToClipboard } from '../../../lib/clipboard'
import { buildCurlCommand } from '../../../lib/curl'
import { showSuccessToast, showToast } from '../../../lib/toast'
import { trafficTexts } from '../../traffic/texts'
import { dashboardTexts } from '../texts'
import { useAppWebSocket } from './useAppWebSocket'
import type { TrafficEntry } from '../../../types'

const FLOATING_TRAFFIC_WINDOW_LABEL = 'floating-traffic'
const FLOATING_TRAFFIC_VIEW_PATH = '/?view=floating-traffic'
const TAB_QUERY_KEY = 'tab'

export type DashboardTab = 'traffic' | 'override' | 'breakpoints' | 'saved'

function getProxyPortFromListenAddress(proxyListenAddress: string | null): number | null {
  if (!proxyListenAddress) return null
  const listenAddressParts = proxyListenAddress.split(':')
  const portPart = listenAddressParts[listenAddressParts.length - 1] ?? ''
  const proxyPort = Number.parseInt(portPart, 10)
  if (!Number.isFinite(proxyPort) || proxyPort <= 0 || proxyPort > 65535) {
    return null
  }
  return proxyPort
}

function readDashboardTabFromUrl(): DashboardTab {
  const rawTab = new URLSearchParams(window.location.search).get(TAB_QUERY_KEY)
  if (
    rawTab === 'traffic' ||
    rawTab === 'override' ||
    rawTab === 'breakpoints' ||
    rawTab === 'saved'
  ) {
    return rawTab
  }
  return 'traffic'
}

export function useDashboard() {
  const [activeTab, setActiveTab] = useState<DashboardTab>(() =>
    readDashboardTabFromUrl(),
  )
  const [highlightedBreakpointId, setHighlightedBreakpointId] = useState<string | null>(
    null,
  )
  const navigateToTab = useCallback((nextTab: DashboardTab) => {
    const params = new URLSearchParams(window.location.search)
    if (nextTab === 'traffic') {
      params.delete(TAB_QUERY_KEY)
    } else {
      params.set(TAB_QUERY_KEY, nextTab)
    }
    const queryString = params.toString()
    const nextUrl = queryString.length > 0 ? `/?${queryString}` : '/'
    window.history.pushState({}, '', nextUrl)
    setActiveTab(nextTab)
  }, [])
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(readDashboardTabFromUrl())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])
  const openBreakpointsPanel = useCallback(() => {
    navigateToTab('breakpoints')
  }, [navigateToTab])
  const closeBreakpointsPanel = useCallback(() => {
    setHighlightedBreakpointId(null)
    navigateToTab('traffic')
  }, [navigateToTab])
  const openSavedRequestsPanel = useCallback(() => {
    navigateToTab('saved')
  }, [navigateToTab])
  const closeSavedRequestsPanel = useCallback(() => {
    navigateToTab('traffic')
  }, [navigateToTab])
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
  const [capturePaused, setCapturePaused] = useState(false)
  const [captureToggleSaving, setCaptureToggleSaving] = useState(false)
  const [wifiProxySaving, setWifiProxySaving] = useState(false)
  const [exportHarSaving, setExportHarSaving] = useState(false)

  const traffic = useTrafficState()
  useMainWindowTrafficSelect(traffic.setSelectedId)
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
    openOverrideEditorForKey,
    setOverrideError,
    setOverrideEditingId,
    setOverrideForm,
    bumpRequestPanel,
    setOverridesPanel,
    refreshOverrides,
  } = ovr
  const brk = useBreakpointState({ openBreakpointsPanel })
  const { breakpoints, setBreakpointForm, refreshBreakpoints, startNewBreakpoint } = brk

  const selectedIdRef = useRef<string | null>(null)

  useEffect(() => {
    selectedIdRef.current = traffic.selectedId
  }, [traffic.selectedId])

  useAppWebSocket({
    setEntries: traffic.setEntries,
    selectedIdRef,
    setSelectedId: traffic.setSelectedId,
    setWsStatus,
    setUrlFilterFromQuery: traffic.setUrlFilterFromQuery,
    onProxyListenAddressChange: setProxyListenAddress,
    openFloatingTrafficWindow,
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
    let isCancelled = false
    const loadHealth = async () => {
      try {
        const r = await fetch('/api/health')
        if (!r.ok || isCancelled) return
        const h = (await r.json()) as {
          mitmEnabled?: boolean
          mitmCaPemPath?: string | null
          proxyPort?: number
          proxyListenIpv4?: string | null
          capturePaused?: boolean
        }
        if (isCancelled) return
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
        const nextProxyListenAddress =
          ipv4 != null &&
          typeof h.proxyPort === 'number' &&
          Number.isFinite(h.proxyPort) &&
          h.proxyPort > 0 &&
          h.proxyPort <= 65535
            ? `${ipv4}:${h.proxyPort}`
            : null
        if (nextProxyListenAddress != null) {
          setProxyListenAddress(nextProxyListenAddress)
        } else {
          setProxyListenAddress(null)
        }
        setCapturePaused(Boolean(h.capturePaused))
      } catch {
        /* ignore */
      }
    }
    void loadHealth()
    return () => {
      isCancelled = true
    }
  }, [])

  const setSystemHttpHttpsProxyEnabled = useCallback(
    async (enabled: boolean) => {
      const proxyPort = enabled ? getProxyPortFromListenAddress(proxyListenAddress) : null
      if (enabled && proxyPort == null) {
        throw new Error(dashboardTexts.header.missingProxyAddress)
      }
      const response = await fetch('/api/system-proxy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          enabled,
          ...(proxyPort == null ? {} : { proxyPort }),
        }),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
    },
    [proxyListenAddress],
  )

  const toggleCapturePaused = useCallback(async () => {
    const targetPaused = !capturePaused
    setCaptureToggleSaving(true)
    try {
      const endpoint = targetPaused ? '/api/capture/pause' : '/api/capture/resume'
      if (!targetPaused) {
        await setSystemHttpHttpsProxyEnabled(true)
      }
      const r = await fetch(endpoint, { method: 'POST' })
      if (!r.ok) {
        throw new Error(`HTTP ${r.status}`)
      }
      if (targetPaused) {
        try {
          await setSystemHttpHttpsProxyEnabled(false)
        } catch (error) {
          await fetch('/api/capture/resume', { method: 'POST' }).catch(() => {
            /* ignore rollback failure */
          })
          throw error
        }
      }
      setCapturePaused(targetPaused)
    } catch (error) {
      if (!targetPaused) {
        await setSystemHttpHttpsProxyEnabled(false).catch(() => {
          /* ignore rollback failure */
        })
      }
      const detail = error instanceof Error ? error.message : String(error)
      window.alert(
        targetPaused
          ? dashboardTexts.header.pauseCaptureFailed(detail)
          : dashboardTexts.header.resumeCaptureFailed(detail),
      )
    } finally {
      setCaptureToggleSaving(false)
    }
  }, [capturePaused, setSystemHttpHttpsProxyEnabled])

  const enableWifiHttpHttpsProxy = useCallback(async () => {
    const proxyPort = getProxyPortFromListenAddress(proxyListenAddress)
    if (proxyPort == null) {
      window.alert(dashboardTexts.header.missingProxyAddress)
      return
    }
    setWifiProxySaving(true)
    try {
      await setSystemHttpHttpsProxyEnabled(true)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      window.alert(dashboardTexts.header.enableWifiProxyFailed(detail))
    } finally {
      setWifiProxySaving(false)
    }
  }, [proxyListenAddress, setSystemHttpHttpsProxyEnabled])

  const { selected, entries, filteredEntries, urlFilterTrimmed } = traffic
  const getEntrySummaryById = useCallback(
    (id: string) => entries.find((entry) => entry.id === id) ?? null,
    [entries],
  )
  const getEntryDetailById = useCallback(
    async (id: string): Promise<TrafficEntry> => {
      if (selected?.id === id) return selected
      const response = await fetch(`/api/requests/${id}`)
      if (!response.ok) {
        throw new Error(`Load request detail failed (HTTP ${response.status})`)
      }
      return (await response.json()) as TrafficEntry
    },
    [selected],
  )

  const exportFilteredTrafficAsHar = useCallback(async () => {
    if (exportHarSaving) return
    setExportHarSaving(true)
    try {
      const detailEntries = await Promise.all(
        filteredEntries.map((entry) => getEntryDetailById(entry.id)),
      )
      const har = trafficEntriesToHar(detailEntries)
      const payload = JSON.stringify(har, null, 2)
      const timestamp = new Date().toISOString().replace(/:/g, '-')
      downloadBlob(
        new Blob([payload], {
          type: 'application/json;charset=utf-8',
        }),
        `traffic-${timestamp}.har`,
      )
      showSuccessToast(
        dashboardTexts.header.exportHarSuccess(filteredEntries.length),
      )
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      showToast(dashboardTexts.header.exportHarFailed(detail), 'error')
    } finally {
      setExportHarSaving(false)
    }
  }, [exportHarSaving, filteredEntries, getEntryDetailById])

  const selectedIsSaved = useMemo(
    () => Boolean(selected && isRequestSaved(selected.id)),
    [isRequestSaved, selected],
  )
  const savedTrafficEntryIds = useMemo(
    () => new Set(savedRequests.map((request) => request.id)),
    [savedRequests],
  )

  const saveSelectedRequest = useCallback(async () => {
    if (!selected) return
    try {
      await saveRequest(selected)
    } catch (e) {
      window.alert(String(e))
    }
  }, [saveRequest, selected])

  const saveEntryRequest = useCallback(
    async (id: string) => {
      traffic.setSelectedId(id)
      try {
        const entry = await getEntryDetailById(id)
        await saveRequest(entry)
      } catch (e) {
        window.alert(String(e))
      }
    },
    [getEntryDetailById, saveRequest, traffic],
  )

  const copyEntryCurl = useCallback(
    async (id: string) => {
      try {
        const entry = await getEntryDetailById(id)
        const curl = buildCurlCommand(entry)
        await copyTextToClipboard(curl)
        showSuccessToast(trafficTexts.copyCurlSuccess)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        showToast(trafficTexts.copyCurlFailed(detail), 'error')
      }
    },
    [getEntryDetailById],
  )

  const selectedMatchingOverride = useMemo(() => {
    if (!selected || selected.kind !== 'http') return null
    if (selected.overrideMatchId) {
      return overrides.find((rule) => rule.id === selected.overrideMatchId) ?? null
    }
    return (
      overrides.find(
        (o) => o.enabled && trafficEntryMatchesOverride(selected, o),
      ) ?? null
    )
  }, [overrides, selected])

  // 命中规则的计算已下沉到后端：条目自带 overrideMatchId，规则变更后后端会重算并推 snapshot。
  // 这里只做 O(n) 读取，避免在每条流量更新时整表跑正则匹配。
  const matchedOverrideByEntryId = useMemo(() => {
    const matchedByEntryId = new Map<string, string>()
    for (const entry of filteredEntries) {
      if (entry.overrideMatchId) {
        matchedByEntryId.set(entry.id, entry.overrideMatchId)
      }
    }
    return matchedByEntryId
  }, [filteredEntries])

  const selectedMatchingBreakpoint = useMemo(() => {
    if (!selected || selected.kind !== 'http') return null
    if (selected.breakpointMatchId) {
      return (
        breakpoints.find((rule) => rule.id === selected.breakpointMatchId) ?? null
      )
    }
    return (
      breakpoints.find((rule) => rule.enabled && breakpointMatches(rule, selected)) ??
      null
    )
  }, [breakpoints, selected])

  // 同上：直接读取后端写入的 breakpointMatchId，不在前端整表重算。
  const matchedBreakpointByEntryId = useMemo(() => {
    const matchedByEntryId = new Map<string, string>()
    for (const entry of filteredEntries) {
      if (entry.breakpointMatchId) {
        matchedByEntryId.set(entry.id, entry.breakpointMatchId)
      }
    }
    return matchedByEntryId
  }, [filteredEntries])

  const pendingRequestIdByBreakpointId = useMemo(() => {
    const pendingByBreakpointId = new Map<string, string>()
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]
      if (!entry || entry.kind !== 'http' || !entry.pending) continue
      const breakpointId = entry.breakpointMatchId ?? null
      if (!breakpointId || pendingByBreakpointId.has(breakpointId)) continue
      pendingByBreakpointId.set(breakpointId, entry.id)
    }
    return pendingByBreakpointId
  }, [entries])

  const openMatchedOverride = useCallback(() => {
    if (!selected || selected.kind !== 'http') return
    if (!selected.overrideMatchId) return
    const matchedOverride = overrides.find(
      (rule) => rule.id === selected.overrideMatchId,
    )
    if (!matchedOverride) return
    setOverrideError(null)
    setOverridesPanel({ state: 'edit', source: 'traffic' })
    openOverrideEditorForKey(matchedOverride)
    navigateToTab('override')
  }, [
    navigateToTab,
    openOverrideEditorForKey,
    overrides,
    selected,
    setOverrideError,
    setOverridesPanel,
  ])

  const openMatchedOverrideForEntry = useCallback(
    (id: string) => {
      const matchedOverrideId = matchedOverrideByEntryId.get(id)
      if (!matchedOverrideId) return
      const matchedOverride = overrides.find((rule) => rule.id === matchedOverrideId)
      if (!matchedOverride) return
      traffic.setSelectedId(id)
      setOverrideError(null)
      setOverridesPanel({ state: 'edit', source: 'traffic' })
      openOverrideEditorForKey(matchedOverride)
      navigateToTab('override')
    },
    [
      matchedOverrideByEntryId,
      navigateToTab,
      openOverrideEditorForKey,
      overrides,
      setOverrideError,
      setOverridesPanel,
      traffic,
    ],
  )

  const openMatchedBreakpoint = useCallback(() => {
    if (!selected || selected.kind !== 'http') return
    if (!selected.breakpointMatchId) return
    const matchedBreakpoint = breakpoints.find(
      (rule) => rule.id === selected.breakpointMatchId,
    )
    if (matchedBreakpoint) {
      setBreakpointForm({
        name: matchedBreakpoint.name,
        matchMethod: matchedBreakpoint.matchMethod ?? '',
        matchOrigin: matchedBreakpoint.matchOrigin ?? '',
        matchPathRegex: matchedBreakpoint.matchPathRegex ?? '',
      })
    }
    setHighlightedBreakpointId(selected.breakpointMatchId)
    openBreakpointsPanel()
  }, [breakpoints, openBreakpointsPanel, selected, setBreakpointForm])

  const openMatchedBreakpointForEntry = useCallback(
    (id: string) => {
      const matchedBreakpointId = matchedBreakpointByEntryId.get(id)
      if (!matchedBreakpointId) return
      const matchedBreakpoint = breakpoints.find((rule) => rule.id === matchedBreakpointId)
      if (matchedBreakpoint) {
        setBreakpointForm({
          name: matchedBreakpoint.name,
          matchMethod: matchedBreakpoint.matchMethod ?? '',
          matchOrigin: matchedBreakpoint.matchOrigin ?? '',
          matchPathRegex: matchedBreakpoint.matchPathRegex ?? '',
        })
      }
      traffic.setSelectedId(id)
      setHighlightedBreakpointId(matchedBreakpointId)
      openBreakpointsPanel()
    },
    [
      breakpoints,
      matchedBreakpointByEntryId,
      openBreakpointsPanel,
      setBreakpointForm,
      traffic,
    ],
  )

  const activeOverridesCount = useMemo(
    () => overrides.filter((rule) => rule.enabled).length,
    [overrides],
  )
  const activeBreakpointsCount = useMemo(
    () => breakpoints.filter((rule) => rule.enabled).length,
    [breakpoints],
  )

  const selectedCanControlStream = Boolean(
    selected &&
      selected.kind === 'http' &&
      selectedMatchingBreakpoint &&
      selectedMatchingOverride?.streamIntervalMs != null &&
      selectedMatchingOverride?.id === ovr.overrideEditingId &&
      selected.streamControllable,
  )

  const matchedTrafficEntryIds = useMemo(() => {
    const matchedIds = new Set<string>()
    for (const entry of filteredEntries) {
      if (entry.overrideMatchId || entry.breakpointMatchId) {
        matchedIds.add(entry.id)
      }
    }
    return matchedIds
  }, [filteredEntries])

  const addBreakpointFromSelected = useCallback(() => {
    if (!selected || selected.kind !== 'http') return
    const matchOrigin = trafficEntryOrigin(selected)
    const matchPathRegex = selected.path
    startNewBreakpoint()
    setBreakpointForm({
      name: `Pause ${selected.method} ${selected.path}`,
      matchMethod: selected.method,
      matchOrigin,
      matchPathRegex,
    })
    openBreakpointsPanel()
  }, [
    openBreakpointsPanel,
    selected,
    setBreakpointForm,
    startNewBreakpoint,
  ])

  const addBreakpointFromEntry = useCallback(
    async (id: string) => {
      const entry = getEntrySummaryById(id)
      if (!entry || entry.kind !== 'http') return
      traffic.setSelectedId(id)
      const matchOrigin = trafficEntryOrigin(entry)
      const matchPathRegex = entry.path
      startNewBreakpoint()
      setBreakpointForm({
        name: `Pause ${entry.method} ${entry.path}`,
        matchMethod: entry.method,
        matchOrigin,
        matchPathRegex,
      })
      openBreakpointsPanel()
    },
    [
      getEntrySummaryById,
      openBreakpointsPanel,
      setBreakpointForm,
      startNewBreakpoint,
      traffic,
    ],
  )

  const { addBreakpointFromOverride: addBreakpointFromOverrideApi } = brk
  const addBreakpointFromOverride = useCallback(
    (
      source: {
        name: string
        matchMethod?: string | null
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
      matchMethod: m.matchMethod,
      matchProtocol: m.matchProtocol,
      matchHost: m.matchHost,
      matchPath: m.matchPath,
      matchQuery: m.matchQuery,
    })
    bumpRequestPanel()
    setOverridesPanel({ state: 'edit', source: 'traffic' })
    navigateToTab('override')
  }, [
    navigateToTab,
    selected,
    bumpRequestPanel,
    setOverrideEditingId,
    setOverrideError,
    setOverrideForm,
    setOverridesPanel,
  ])

  const openEntryOverrideDrawer = useCallback(
    async (id: string) => {
      const summary = getEntrySummaryById(id)
      if (!summary || summary.kind !== 'http') return
      traffic.setSelectedId(id)
      try {
        const entry = await getEntryDetailById(id)
        setOverrideError(null)
        const matchParts = urlMatchPartsForForm(entry)
        setOverrideEditingId(null)
        setOverrideForm({
          ...getDefaultOverrideForm(),
          status: entry.responseStatus ?? 200,
          body: entry.responseBodyPreview ?? '',
          headersText: headersToText(entry.responseHeaders ?? undefined),
          matchMethod: matchParts.matchMethod,
          matchProtocol: matchParts.matchProtocol,
          matchHost: matchParts.matchHost,
          matchPath: matchParts.matchPath,
          matchQuery: matchParts.matchQuery,
        })
        bumpRequestPanel()
        setOverridesPanel({ state: 'edit', source: 'traffic' })
        navigateToTab('override')
      } catch (error) {
        window.alert(String(error))
      }
    },
    [
      bumpRequestPanel,
      getEntryDetailById,
      getEntrySummaryById,
      navigateToTab,
      setOverrideEditingId,
      setOverrideError,
      setOverrideForm,
      setOverridesPanel,
      traffic,
    ],
  )

  const replayEntryRequest = useCallback(
    async (id: string) => {
      const entry = getEntrySummaryById(id)
      if (!entry || entry.kind !== 'http') return
      traffic.setSelectedId(id)
      try {
        const response = await fetch(`/api/requests/${entry.id}/replay`, {
          method: 'POST',
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        showSuccessToast(trafficTexts.replayRequestSuccess)
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error)
        showToast(trafficTexts.replayRequestFailed(detail), 'error')
      }
    },
    [getEntrySummaryById, traffic],
  )

  const openSavedRequestForEntry = useCallback(
    (id: string) => {
      if (!savedTrafficEntryIds.has(id)) return
      setSelectedSavedRequestId(id)
      navigateToTab('saved')
    },
    [navigateToTab, savedTrafficEntryIds, setSelectedSavedRequestId],
  )

  const onOverridesNavClick = useCallback(() => {
    ovr.onOverridesNavClick()
    navigateToTab('override')
  }, [navigateToTab, ovr])

  const breakpointsOpen = activeTab === 'breakpoints'
  const savedRequestsOpen = activeTab === 'saved'
  const selectedRequestOrigin =
    selected && selected.kind === 'http' ? trafficEntryOrigin(selected) : ''

  return {
    activeTab,
    navigateToTab,
    wsStatus,
    urlFilterTrimmed,
    filteredCount: filteredEntries.length,
    totalCount: entries.length,
    mitmEnabled,
    mitmCaPemPath,
    proxyListenAddress,
    capturePaused,
    captureToggleSaving,
    toggleCapturePaused,
    wifiProxySaving,
    enableWifiHttpHttpsProxy,
    exportHarSaving,
    exportFilteredTrafficAsHar,
    breakpointsOpen,
    savedRequestsOpen,
    closeBreakpointsPanel,
    openSavedRequestsPanel,
    openFloatingTrafficWindow,
    closeSavedRequestsPanel,
    onOverridesNavClick,
    urlFilter: traffic.urlFilter,
    setUrlFilter: traffic.setUrlFilter,
    urlFilterTags: traffic.urlFilterTags,
    activeFilterKeywords: traffic.activeFilterKeywords,
    commitUrlFilterInputAsTag: traffic.commitUrlFilterInputAsTag,
    removeUrlFilterTag: traffic.removeUrlFilterTag,
    popUrlFilterTag: traffic.popUrlFilterTag,
    trafficFilters: traffic.trafficFilters,
    availableRequesterApps: traffic.availableRequesterApps,
    toggleTrafficFilterValue: traffic.toggleTrafficFilterValue,
    clearTrafficFilters: traffic.clearTrafficFilters,
    hasTrafficFilters: traffic.hasTrafficFilters,
    testError: traffic.testError,
    clearTraffic: traffic.clearTraffic,
    filteredEntries: traffic.filteredEntries,
    matchedTrafficEntryIds,
    savedTrafficEntryIds,
    matchedOverrideByEntryId,
    matchedBreakpointByEntryId,
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
    pendingRequestIdByBreakpointId,
    isBreakpointFormActive: brk.isBreakpointFormActive,
    selectedBreakpointId: brk.selectedBreakpointId,
    setSelectedBreakpointId: brk.setSelectedBreakpointId,
    startNewBreakpoint: brk.startNewBreakpoint,
    saveBreakpoint: brk.saveBreakpoint,
    selectedRequestOrigin,
    removeBreakpoint: brk.removeBreakpoint,
    setBreakpointEnabled: brk.setBreakpointEnabled,
    breakpointToggleSaving: brk.breakpointToggleSaving,
    onBreakpointsNavClick: () => {
      setHighlightedBreakpointId(null)
      openBreakpointsPanel()
    },
    highlightedBreakpointId,
    activeOverridesCount,
    activeBreakpointsCount,
    openMatchedOverride,
    openMatchedBreakpoint,
    openMatchedOverrideForEntry,
    openMatchedBreakpointForEntry,
    copyEntryCurl,
    saveEntryRequest,
    openEntryOverrideDrawer,
    addBreakpointFromEntry,
    replayEntryRequest,
    openSavedRequestForEntry,
    savedRequests,
    selectedSavedRequestId,
    setSelectedSavedRequestId,
    removeSavedRequest,
    clearSavedRequests,
  }
}

export type DashboardViewModel = ReturnType<typeof useDashboard>
