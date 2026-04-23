import { useCallback, useState } from 'react'
import { inferOriginFromHostHint } from '../../../lib/dashboardUtils'
import type { BreakpointRule } from '../../../types'
import { breakpointTexts } from '../texts'

type BreakpointFormState = {
  name: string
  matchOrigin: string
  matchPathRegex: string
}

type Tab = 'traffic' | 'breakpoints'

export function useBreakpointState(p: { setTab: (t: Tab) => void }) {
  const { setTab } = p
  const t = breakpointTexts
  const [breakpoints, setBreakpoints] = useState<BreakpointRule[]>([])
  const [breakpointToggleSaving, setBreakpointToggleSaving] = useState<
    Record<string, boolean>
  >({})
  const [breakpointForm, setBreakpointForm] = useState<BreakpointFormState>({
    name: t.defaultFormName,
    matchOrigin: '',
    matchPathRegex: t.defaultPathRegex,
  })

  const refreshBreakpoints = useCallback(async () => {
    const r = await fetch('/api/breakpoints')
    if (r.ok) setBreakpoints(await r.json())
  }, [])

  const addBreakpoint = useCallback(async () => {
    const r = await fetch('/api/breakpoints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: breakpointForm.name.trim() || t.defaultRuleName,
        enabled: true,
        matchOrigin: breakpointForm.matchOrigin.trim() || null,
        matchPathRegex: breakpointForm.matchPathRegex.trim() || null,
      }),
    })
    if (r.ok) {
      await refreshBreakpoints()
      setTab('breakpoints')
    }
  }, [breakpointForm, refreshBreakpoints, setTab, t])

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

  const addBreakpointFromOverride = useCallback(
    async (
      source: {
        name: string
        matchHost?: string | null
        matchPathRegex?: string | null
      },
      originHint: string | undefined,
    ) => {
      const matchOrigin =
        originHint || inferOriginFromHostHint(source.matchHost) || ''
      const matchPathRegex = source.matchPathRegex ?? ''
      setBreakpointForm({
        name: t.pauseName(source.name),
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
          name: t.pauseName(source.name),
          enabled: true,
          matchOrigin,
          matchPathRegex,
        }),
      })
      if (r.ok) {
        await refreshBreakpoints()
      }
    },
    [breakpoints, refreshBreakpoints, setTab, t],
  )

  return {
    breakpoints,
    setBreakpoints,
    breakpointForm,
    setBreakpointForm,
    refreshBreakpoints,
    addBreakpoint,
    removeBreakpoint,
    setBreakpointEnabled,
    breakpointToggleSaving,
    addBreakpointFromOverride,
  }
}

export type BreakpointState = ReturnType<typeof useBreakpointState>
