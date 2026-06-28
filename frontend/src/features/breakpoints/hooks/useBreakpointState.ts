import { useCallback, useEffect, useState } from 'react'
import { inferOriginFromHostHint } from '../../../lib/dashboardUtils'
import { readBillingErrorMessage } from '../../../lib/billingError'
import { showToast } from '../../../lib/toast'
import type { BreakpointRule } from '../../../types'
import { breakpointTexts } from '../texts'

type BreakpointFormState = {
  name: string
  matchMethod: string
  matchOrigin: string
  matchPathRegex: string
}

export function useBreakpointState(p: { openBreakpointsPanel: () => void }) {
  const { openBreakpointsPanel } = p
  const t = breakpointTexts
  const [breakpoints, setBreakpoints] = useState<BreakpointRule[]>([])
  const [breakpointToggleSaving, setBreakpointToggleSaving] = useState<
    Record<string, boolean>
  >({})
  const [selectedBreakpointId, setSelectedBreakpointId] = useState<
    string | null
  >(null)
  const [isBreakpointFormActive, setIsBreakpointFormActive] = useState(false)
  const [breakpointForm, setBreakpointForm] = useState<BreakpointFormState>({
    name: t.defaultFormName,
    matchMethod: 'GET',
    matchOrigin: '',
    matchPathRegex: t.defaultPathRegex,
  })

  useEffect(() => {
    if (!selectedBreakpointId) return
    setIsBreakpointFormActive(false)
  }, [selectedBreakpointId])

  const startNewBreakpoint = useCallback(() => {
    setIsBreakpointFormActive(true)
    setSelectedBreakpointId(null)
    setBreakpointForm({
      name: t.defaultFormName,
      matchMethod: 'GET',
      matchOrigin: '',
      matchPathRegex: t.defaultPathRegex,
    })
  }, [t])

  const refreshBreakpoints = useCallback(async () => {
    const r = await fetch('/api/breakpoints')
    if (r.ok) setBreakpoints(await r.json())
  }, [])

  const showBreakpointUpsertError = useCallback(
    (status: number, mode: 'create' | 'update') => {
      if (status === 409) {
        showToast(t.duplicateIdentity, 'error')
        return
      }
      showToast(
        mode === 'create' ? t.createFailed(status) : t.updateFailed(status),
        'error',
      )
    },
    [t],
  )

  const saveBreakpoint = useCallback(async (originFallback?: string) => {
    if (!selectedBreakpointId && !isBreakpointFormActive) {
      return
    }
    const normalizedOriginFallback = originFallback?.trim() ?? ''
    const normalizedFormOrigin = breakpointForm.matchOrigin.trim()
    const matchOrigin =
      normalizedFormOrigin.length > 0 ? normalizedFormOrigin : normalizedOriginFallback
    const editingRule = selectedBreakpointId
      ? (breakpoints.find((rule) => rule.id === selectedBreakpointId) ?? null)
      : null
    const requestUrl = editingRule
      ? `/api/breakpoints/${editingRule.id}`
      : '/api/breakpoints'
    const requestMethod = editingRule ? 'PUT' : 'POST'
    const r = await fetch(requestUrl, {
      method: requestMethod,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: breakpointForm.name.trim() || t.defaultRuleName,
        enabled: editingRule?.enabled ?? true,
        matchMethod: breakpointForm.matchMethod.trim() || null,
        matchOrigin: matchOrigin || null,
        matchPathRegex: breakpointForm.matchPathRegex.trim() || null,
      }),
    })
    if (r.ok) {
      const savedRule = (await r.json().catch(() => null)) as BreakpointRule | null
      if (savedRule?.id) {
        setSelectedBreakpointId(savedRule.id)
        setIsBreakpointFormActive(false)
      }
      await refreshBreakpoints()
      openBreakpointsPanel()
      return
    }
    const billingMessage = await readBillingErrorMessage(r)
    if (billingMessage) {
      showToast(billingMessage, 'error')
      return
    }
    showBreakpointUpsertError(r.status, editingRule ? 'update' : 'create')
  }, [
    breakpoints,
    breakpointForm,
    openBreakpointsPanel,
    refreshBreakpoints,
    isBreakpointFormActive,
    selectedBreakpointId,
    showBreakpointUpsertError,
    t,
  ])

  const removeBreakpoint = useCallback(
    async (id: string) => {
      const r = await fetch(`/api/breakpoints/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error(`Delete failed (HTTP ${r.status})`)
      setSelectedBreakpointId((prev) => (prev === id ? null : prev))
      if (selectedBreakpointId === id) {
        setIsBreakpointFormActive(false)
      }
      await refreshBreakpoints()
    },
    [refreshBreakpoints, selectedBreakpointId],
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
            matchMethod: rule.matchMethod ?? null,
            matchOrigin: rule.matchOrigin ?? null,
            matchPathRegex: rule.matchPathRegex ?? null,
          }),
        })
        if (!r.ok) {
          const billingMessage = await readBillingErrorMessage(r)
          if (billingMessage) {
            showToast(billingMessage, 'error')
            return
          }
          if (r.status === 409) {
            showToast(t.duplicateIdentity, 'error')
            return
          }
          showToast(t.updateFailed(r.status), 'error')
          return
        }
        await refreshBreakpoints()
      } catch (e) {
        showToast(String(e), 'error')
      } finally {
        setBreakpointToggleSaving((prev) => ({ ...prev, [rule.id]: false }))
      }
    },
    [refreshBreakpoints, t],
  )

  const addBreakpointFromOverride = useCallback(
    (
      source: {
        name: string
        matchMethod?: string | null
        matchHost?: string | null
        /** Plain path from override form; converted to a regex for the breakpoint rule. */
        matchPath?: string | null
      },
      originHint: string | undefined,
    ) => {
      const matchOrigin =
        originHint || inferOriginFromHostHint(source.matchHost) || ''
      const p = (source.matchPath ?? '').trim()
      const matchPathRegex = p
      setIsBreakpointFormActive(true)
      setSelectedBreakpointId(null)
      setBreakpointForm({
        name: t.pauseName(source.name),
        matchMethod: (source.matchMethod ?? '').trim(),
        matchOrigin,
        matchPathRegex,
      })
      openBreakpointsPanel()
    },
    [openBreakpointsPanel, t],
  )

  return {
    breakpoints,
    setBreakpoints,
    isBreakpointFormActive,
    breakpointForm,
    setBreakpointForm,
    selectedBreakpointId,
    setSelectedBreakpointId,
    startNewBreakpoint,
    refreshBreakpoints,
    saveBreakpoint,
    removeBreakpoint,
    setBreakpointEnabled,
    breakpointToggleSaving,
    addBreakpointFromOverride,
  }
}

export type BreakpointState = ReturnType<typeof useBreakpointState>
