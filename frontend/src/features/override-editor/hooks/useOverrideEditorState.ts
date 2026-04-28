import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react'
import {
  getDefaultOverrideForm,
  headersToText,
  isDefaultOverrideForm,
  parseHeadersText,
} from '../../../lib/dashboardUtils'
import { apiPayloadFromRule, computeOverrideIdFromFormState } from '../../../lib/overrideIdentity'
import type { OverrideFormState, OverrideRule } from '../../../types'
import { overrideEditorTexts } from '../texts'

const oreq = overrideEditorTexts.request

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
  const [overrideForm, setOverrideFormState] =
    useState<OverrideFormState>(getDefaultOverrideForm)
  const [computedOverrideId, setComputedOverrideId] = useState<string | null>(null)

  const setOverrideForm = useCallback((action: SetStateAction<OverrideFormState>) => {
    setOverrideFormState((prev) => {
      const next =
        typeof action === 'function'
          ? (action as (p: OverrideFormState) => OverrideFormState)(prev)
          : action
      queueMicrotask(() => {
        if (isDefaultOverrideForm(next)) {
          setComputedOverrideId(null)
        } else {
          void computeOverrideIdFromFormState(next).then(setComputedOverrideId)
        }
      })
      return next
    })
  }, [])

  const refreshOverrides = useCallback(async () => {
    const r = await fetch('/api/overrides')
    if (!r.ok) return
    const raw = (await r.json()) as OverrideRule[]
    setOverrides(
      raw.map((x) => ({
        ...x,
        matchRequestHeaders: x.matchRequestHeaders ?? [],
        matchQuery: x.matchQuery ?? [],
      })),
    )
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

  const buildPayloadJson = useCallback(
    (form: OverrideFormState, body: string) => {
      const streamIntervalMs = form.streamEnabled
        ? Math.max(0, Number(form.streamIntervalMs) || 500)
        : null
      return {
        enabled: form.enabled,
        matchProtocol: form.matchProtocol || null,
        matchHost: form.matchHost.trim() || null,
        matchPath: form.matchPath || null,
        matchRequestHeaders: form.matchRequestHeaders.filter(
          ([a, b]) => a.trim() !== '' || b.trim() !== '',
        ),
        matchQuery: form.matchQuery.filter(
          ([a, b]) => a.trim() !== '' || b.trim() !== '',
        ),
        matchRequestBody: form.matchRequestBody.trim() || null,
        status: form.status,
        headers: parseHeadersText(form.headersText),
        body,
        streamIntervalMs,
      }
    },
    [],
  )

  const openOverridesFromNav = useCallback(() => {
    setOverrideError(null)
    setOverrideForm(getDefaultOverrideForm())
    setOverrideEditingId(null)
    setOverridesPanel({ state: 'edit', source: 'nav' })
  }, [setOverrideForm])

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
  }, [bumpRequestPanel, setOverrideForm])

  const closeOverrideDrawer = useCallback(() => {
    setOverrideError(null)
    setOverridesPanel({ state: 'closed' })
  }, [])

  const openOverrideEditorForKey = useCallback(
    (override: OverrideRule) => {
      setOverrideError(null)
      setOverrideEditingId(override.id)
      setOverrideForm({
        enabled: override.enabled,
        status: override.status,
        body: override.body,
        headersText: headersToText(override.headers),
        matchProtocol: override.matchProtocol ?? '',
        matchHost: override.matchHost ?? '',
        matchPath: override.matchPath ?? '',
        matchRequestHeaders: [...(override.matchRequestHeaders ?? [])],
        matchQuery: [...(override.matchQuery ?? [])],
        matchRequestBody: override.matchRequestBody ?? '',
        streamEnabled: override.streamIntervalMs != null,
        streamIntervalMs: override.streamIntervalMs ?? 500,
      })
      bumpRequestPanel()
    },
    [bumpRequestPanel, setOverrideForm],
  )

  const deleteOverrideRule = useCallback(
    async (id: string) => {
      const r = await fetch(`/api/overrides/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
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
        const r = await fetch(
          `/api/overrides/${encodeURIComponent(override.id)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(
              apiPayloadFromRule(override, body, override.enabled),
            ),
          },
        )
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
        const b = overrideBodyDrafts[override.id] ?? override.body
        const r = await fetch(
          `/api/overrides/${encodeURIComponent(override.id)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(apiPayloadFromRule(override, b, enabled)),
          },
        )
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
    if (!overrideForm.matchHost.trim()) {
      setOverrideError(oreq.hostRequired)
      return
    }
    const body = overrideForm.body
    const payload = buildPayloadJson(overrideForm, body)
    try {
      if (overrideEditingId) {
        const r = await fetch(
          `/api/overrides/${encodeURIComponent(overrideEditingId)}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
        )
        if (r.status === 409) {
          setOverrideError(oreq.saveIdConflict)
          return
        }
        if (r.status === 400) {
          setOverrideError(oreq.hostRequired)
          return
        }
        if (!r.ok) throw new Error(`Save failed (HTTP ${r.status})`)
        const updated = (await r.json()) as OverrideRule
        setOverrideEditingId(updated.id)
      } else {
        const r = await fetch('/api/overrides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (r.status === 400) {
          setOverrideError(oreq.hostRequired)
          return
        }
        if (r.status === 409) {
          setOverrideError(oreq.duplicateMatchIdentity)
          return
        }
        if (!r.ok) throw new Error(`Save failed (HTTP ${r.status})`)
        const rule = (await r.json()) as OverrideRule
        setOverrideEditingId(rule.id)
      }
      await refreshOverrides()
    } catch (e) {
      setOverrideError(String(e))
    }
  }, [buildPayloadJson, overrideEditingId, overrideForm, refreshOverrides])

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
    computedOverrideId,
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
