import type { ReactElement } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { PanelHeader } from '@/components/panel-header'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ThemePreference } from '../../../theme/themeController'
import type { RequestCatalogSettings } from '../../../types'
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
}

export function SettingsPanelUI({
  preference,
  setPreference,
  requestCatalogSettings,
  requestCatalogSettingsSaving,
  setPersistSensitiveHeaders,
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
