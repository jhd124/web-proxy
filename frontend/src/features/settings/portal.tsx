import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../../hooks/useTheme'
import { showToast } from '../../lib/toast'
import type { RequestCatalogSettings } from '../../types'
import { settingsTexts as t } from './texts'
import { SettingsPanelUI } from './ui/SettingsPanelUI'

export function SettingsPanelPortal() {
  const { preference, setPreference } = useTheme()
  const [requestCatalogSettings, setRequestCatalogSettings] =
    useState<RequestCatalogSettings>({ persistSensitiveHeaders: false })
  const [requestCatalogSettingsSaving, setRequestCatalogSettingsSaving] =
    useState(false)

  useEffect(() => {
    const controller = new AbortController()
    async function loadSettings() {
      try {
        const response = await fetch('/api/request-catalog/settings', {
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        setRequestCatalogSettings((await response.json()) as RequestCatalogSettings)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        const detail = error instanceof Error ? error.message : String(error)
        showToast(t.requestHistory.loadFailed(detail), 'error')
      }
    }
    void loadSettings()
    return () => controller.abort()
  }, [])

  const setPersistSensitiveHeaders = useCallback(async (nextValue: boolean) => {
    setRequestCatalogSettingsSaving(true)
    const nextSettings = { persistSensitiveHeaders: nextValue }
    setRequestCatalogSettings(nextSettings)
    try {
      const response = await fetch('/api/request-catalog/settings', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(nextSettings),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      setRequestCatalogSettings((await response.json()) as RequestCatalogSettings)
    } catch (error) {
      setRequestCatalogSettings({ persistSensitiveHeaders: !nextValue })
      const detail = error instanceof Error ? error.message : String(error)
      showToast(t.requestHistory.saveFailed(detail), 'error')
    } finally {
      setRequestCatalogSettingsSaving(false)
    }
  }, [])

  return (
    <SettingsPanelUI
      preference={preference}
      setPreference={setPreference}
      requestCatalogSettings={requestCatalogSettings}
      requestCatalogSettingsSaving={requestCatalogSettingsSaving}
      setPersistSensitiveHeaders={setPersistSensitiveHeaders}
    />
  )
}
