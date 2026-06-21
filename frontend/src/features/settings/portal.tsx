import { useTheme } from '../../hooks/useTheme'
import { SettingsPanelUI } from './ui/SettingsPanelUI'

export function SettingsPanelPortal() {
  const { preference, setPreference } = useTheme()
  return <SettingsPanelUI preference={preference} setPreference={setPreference} />
}
