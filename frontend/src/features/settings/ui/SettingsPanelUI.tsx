import type { ReactElement } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { PanelHeader } from '@/components/panel-header'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ThemePreference } from '../../../theme/themeController'
import type { BillingStatus, PlanLimits, RequestCatalogSettings } from '../../../types'
import { settingsTexts as t } from '../texts'
import s from './SettingsPanelUI.module.css'

type ThemeOption = {
  value: ThemePreference
  label: string
  Icon: typeof Monitor
}

const THEME_OPTIONS: ThemeOption[] = [
  { value: 'system', label: t.appearance.options.system, Icon: Monitor },
  { value: 'light', label: t.appearance.options.light, Icon: Sun },
  { value: 'dark', label: t.appearance.options.dark, Icon: Moon },
]

type SettingsPanelUIProps = {
  preference: ThemePreference
  setPreference: (next: ThemePreference) => void
  requestCatalogSettings: RequestCatalogSettings
  requestCatalogSettingsSaving: boolean
  setPersistSensitiveHeaders: (next: boolean) => Promise<void>
  billingStatus: BillingStatus | null
  licenseKey: string
  setLicenseKey: (next: string) => void
  licenseActivating: boolean
  activateLicense: () => Promise<void>
  openPurchasePage: () => Promise<void>
}

export function SettingsPanelUI({
  preference,
  setPreference,
  requestCatalogSettings,
  requestCatalogSettingsSaving,
  setPersistSensitiveHeaders,
  billingStatus,
  licenseKey,
  setLicenseKey,
  licenseActivating,
  activateLicense,
  openPurchasePage,
}: SettingsPanelUIProps): ReactElement {
  return (
    <div className={s.panel}>
      <PanelHeader id="settings-title" title={t.title} />
      <ScrollArea className="min-h-0 flex-1">
        <div className={s.body}>
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h3 className={s.sectionTitle}>{t.appearance.sectionTitle}</h3>
              <p className={`small muted ${s.sectionDesc}`}>
                {t.appearance.description}
              </p>
            </div>
            <div
              className={s.segmented}
              role="radiogroup"
              aria-label={t.appearance.sectionTitle}
            >
              {THEME_OPTIONS.map(({ value, label, Icon }) => {
                const isActive = preference === value
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={isActive}
                    className={`${s.segment} ${isActive ? s.segmentActive : ''}`}
                    onClick={() => setPreference(value)}
                  >
                    <Icon size={16} aria-hidden />
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </section>
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h3 className={s.sectionTitle}>{t.billing.sectionTitle}</h3>
              <p className={`small muted ${s.sectionDesc}`}>
                {t.billing.description}
              </p>
            </div>
            <div className={s.billingCard}>
              <div className={s.billingMeta}>
                <span className={s.billingPlan}>
                  {billingStatus
                    ? t.billing.plan[billingStatus.plan]
                    : t.billing.loading}
                </span>
                <span className="small muted">
                  {billingStatus?.activated
                    ? t.billing.activated(billingStatus.licenseId ?? '')
                    : t.billing.trial}
                </span>
              </div>
              {billingStatus ? (
                <ul className={s.limitList}>
                  <LimitItem
                    label={t.billing.features.breakpoints}
                    used={billingStatus.usage.breakpoints}
                    limit={billingStatus.limits.breakpoints}
                  />
                  <LimitItem
                    label={t.billing.features.overrides}
                    used={billingStatus.usage.overrides}
                    limit={billingStatus.limits.overrides}
                  />
                  <LimitItem
                    label={t.billing.features.savedRequests}
                    used={billingStatus.usage.savedRequests}
                    limit={billingStatus.limits.savedRequests}
                  />
                </ul>
              ) : null}
              <div className={s.licenseForm}>
                <input
                  className={s.licenseInput}
                  value={licenseKey}
                  placeholder={t.billing.licensePlaceholder}
                  onChange={(event) => setLicenseKey(event.target.value)}
                />
                <button
                  type="button"
                  className={s.primaryButton}
                  disabled={licenseActivating}
                  onClick={() => void activateLicense()}
                >
                  {licenseActivating ? t.billing.activating : t.billing.activate}
                </button>
                <button
                  type="button"
                  className={s.secondaryButton}
                  onClick={() => void openPurchasePage()}
                >
                  {t.billing.purchase}
                </button>
              </div>
            </div>
          </section>
          <section className={s.section}>
            <div className={s.sectionHead}>
              <h3 className={s.sectionTitle}>{t.requestHistory.sectionTitle}</h3>
              <p className={`small muted ${s.sectionDesc}`}>
                {t.requestHistory.description}
              </p>
            </div>
            <div
              className={s.segmented}
              role="radiogroup"
              aria-label={t.requestHistory.sensitiveHeaders}
            >
              <button
                type="button"
                role="radio"
                aria-checked={!requestCatalogSettings.persistSensitiveHeaders}
                disabled={requestCatalogSettingsSaving}
                className={`${s.segment} ${
                  !requestCatalogSettings.persistSensitiveHeaders
                    ? s.segmentActive
                    : ''
                }`}
                onClick={() => void setPersistSensitiveHeaders(false)}
              >
                <span>{t.requestHistory.options.disabled}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={requestCatalogSettings.persistSensitiveHeaders}
                disabled={requestCatalogSettingsSaving}
                className={`${s.segment} ${
                  requestCatalogSettings.persistSensitiveHeaders
                    ? s.segmentActive
                    : ''
                }`}
                onClick={() => void setPersistSensitiveHeaders(true)}
              >
                <span>{t.requestHistory.options.enabled}</span>
              </button>
            </div>
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}

type LimitItemProps = {
  label: string
  used: number
  limit: PlanLimits[keyof PlanLimits]
}

function LimitItem({ label, used, limit }: LimitItemProps): ReactElement {
  return (
    <li className={s.limitItem}>
      <span>{label}</span>
      <span className="small muted">
        {used} / {limit == null ? t.billing.unlimited : limit}
      </span>
    </li>
  )
}
