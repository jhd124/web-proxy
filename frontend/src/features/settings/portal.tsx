import { useCallback, useEffect, useState } from 'react'
import { useTheme } from '../../hooks/useTheme'
import { getDesktopHost } from '../../lib/desktopHost'
import { showToast } from '../../lib/toast'
import type { ActivateLicenseRequest, BillingStatus, RequestCatalogSettings } from '../../types'
import { settingsTexts as t } from './texts'
import { SettingsPanelUI } from './ui/SettingsPanelUI'

const DEFAULT_PURCHASE_URL = 'http://127.0.0.1:8787'

export function SettingsPanelPortal() {
  const { preference, setPreference } = useTheme()
  const [requestCatalogSettings, setRequestCatalogSettings] =
    useState<RequestCatalogSettings>({ persistSensitiveHeaders: false })
  const [requestCatalogSettingsSaving, setRequestCatalogSettingsSaving] =
    useState(false)
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null)
  const [licenseKey, setLicenseKey] = useState('')
  const [licenseActivating, setLicenseActivating] = useState(false)

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

  const loadBillingStatus = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/billing/status', { signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    setBillingStatus((await response.json()) as BillingStatus)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    async function loadBilling() {
      try {
        await loadBillingStatus(controller.signal)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        const detail = error instanceof Error ? error.message : String(error)
        showToast(t.billing.loadFailed(detail), 'error')
      }
    }
    void loadBilling()
    return () => controller.abort()
  }, [loadBillingStatus])

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

  const activateLicense = useCallback(async () => {
    const normalizedLicenseKey = licenseKey.trim()
    if (!normalizedLicenseKey) {
      showToast(t.billing.emptyLicenseKey, 'error')
      return
    }
    setLicenseActivating(true)
    try {
      const body: ActivateLicenseRequest = { licenseKey: normalizedLicenseKey }
      const response = await fetch('/api/billing/activate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      setBillingStatus((await response.json()) as BillingStatus)
      setLicenseKey('')
      showToast(t.billing.activateSucceeded, 'success')
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      showToast(t.billing.activateFailed(detail), 'error')
    } finally {
      setLicenseActivating(false)
    }
  }, [licenseKey])

  const openPurchasePage = useCallback(async () => {
    const url = import.meta.env.VITE_BILLING_PURCHASE_URL ?? DEFAULT_PURCHASE_URL
    const desktopHost = getDesktopHost()
    if (desktopHost) {
      await desktopHost.openExternalUrl(url)
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }, [])

  return (
    <SettingsPanelUI
      preference={preference}
      setPreference={setPreference}
      requestCatalogSettings={requestCatalogSettings}
      requestCatalogSettingsSaving={requestCatalogSettingsSaving}
      setPersistSensitiveHeaders={setPersistSensitiveHeaders}
      billingStatus={billingStatus}
      licenseKey={licenseKey}
      setLicenseKey={setLicenseKey}
      licenseActivating={licenseActivating}
      activateLicense={activateLicense}
      openPurchasePage={openPurchasePage}
    />
  )
}
