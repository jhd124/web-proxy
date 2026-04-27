import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getDefaultOverrideForm,
  headersToText,
  parseHeadersText,
} from '../../../lib/dashboardUtils'
import type { OverrideFormState, OverrideRule } from '../../../types'
import { overrideEditorTexts } from '../texts'

const of = overrideEditorTexts.form

export function useOverrideEditorState() {
  const [overrides, setOverrides] = useState<OverrideRule[]>([])
  const [overridesPanel, setOverridesPanel] = useState<
    { state: 'closed' } | { state: 'edit'; source: 'nav' | 'traffic' }
  >({ state: 'closed' })
  const [requestPanelFocusKey, setRequestPanelFocusKey] = useState(0)
  const bumpRequestPanel = useCallback(() => {
    setRequestPanelFocusKey((k) => k + 1)
  }, [])
  const overrideFileInputRef = useRef<HTMLInputElement | null>(null)
  const [overrideBodyDrafts, setOverrideBodyDrafts] = useState<Record<string, string>>({})
  const [overrideBodySaving, setOverrideBodySaving] = useState<Record<string, boolean>>({})
  const [overrideToggleSaving, setOverrideToggleSaving] = useState<Record<string, boolean>>(
    {},
  )
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [overrideEditingId, setOverrideEditingId] = useState<string | null>(null)
  const [overrideForm, setOverrideForm] =
    useState<OverrideFormState>(getDefaultOverrideForm)

  const refreshOverrides = useCallback(async () => {
    const r = await fetch('/api/overrides')
    if (r.ok) setOverrides(await r.json())
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

  const openOverridesFromNav = useCallback(() => {
    setOverrideError(null)
    setOverrideForm(getDefaultOverrideForm())
    setOverrideEditingId(null)
    setOverridesPanel({ state: 'edit', source: 'nav' })
  }, [])

  const onOverridesNavClick = useCallback(() => {
    setOverrideError(null)
    if (overridesPanel.state === 'edit' && overridesPanel.source === 'nav') {
      return
    }
    openOverridesFromNav()
  }, [overridesPanel, openOverridesFromNav])

  const startNewOverride = useCallback(() => {
    setOverrideError(null)
    setOverrideForm(getDefaultOverrideForm())
    setOverrideEditingId(null)
    bumpRequestPanel()
  }, [bumpRequestPanel])

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
        matchPath: override.matchPath ?? '',
        streamEnabled: override.streamIntervalMs != null,
        streamIntervalMs: override.streamIntervalMs ?? 500,
      })
      bumpRequestPanel()
    },
    [bumpRequestPanel],
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
            matchPath: override.matchPath ?? null,
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
            matchPath: override.matchPath ?? null,
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
      name: overrideForm.name.trim() || of.defaultOverrideName,
      enabled: overrideForm.enabled,
      matchMethod: overrideForm.matchMethod || null,
      matchHost: overrideForm.matchHost || null,
      matchPath: overrideForm.matchPath || null,
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

  return {
    overrides,
    setOverrides,
    overridesPanel,
    setOverridesPanel,
    requestPanelFocusKey,
    bumpRequestPanel,
    overrideFileInputRef,
    overrideBodyDrafts,
    setOverrideBodyDrafts,
    overrideBodySaving,
    overrideToggleSaving,
    overrideError,
    setOverrideError,
    overrideEditingId,
    setOverrideEditingId,
    overrideForm,
    setOverrideForm,
    refreshOverrides,
    openOverridesFromNav,
    onOverridesNavClick,
    startNewOverride,
    closeOverrideDrawer,
    openOverrideEditorForKey,
    deleteOverrideRule,
    saveOverrideBody,
    setOverrideEnabled,
    saveOverride,
  }
}

export type OverrideEditorState = ReturnType<typeof useOverrideEditorState>
