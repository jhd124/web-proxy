import { useCallback, useEffect, useState } from 'react'
import {
  applyThemePreference,
  getSystemMode,
  readStoredPreference,
  storePreference,
  subscribeSystemThemeChange,
  type ThemeMode,
  type ThemePreference,
} from '../theme/themeController'

export type UseThemeResult = {
  /** 用户主题偏好：跟随系统 / 浅色 / 深色 */
  preference: ThemePreference
  /** 解析后的实际模式（跟随系统时为当前系统配色） */
  mode: ThemeMode
  /** 设置并持久化主题偏好 */
  setPreference: (next: ThemePreference) => void
}

// 全局主题偏好 Hook：写入 <html data-theme>、持久化并跟随系统配色变化
export function useTheme(): UseThemeResult {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readStoredPreference(),
  )
  const [systemMode, setSystemMode] = useState<ThemeMode>(() => getSystemMode())

  const mode: ThemeMode = preference === 'system' ? systemMode : preference

  // 同步外部系统：将解析后的模式写入 <html data-theme>
  useEffect(() => {
    applyThemePreference(preference)
  }, [preference, systemMode])

  // 订阅系统配色变化，回调（事件源）中更新 systemMode
  useEffect(() => {
    return subscribeSystemThemeChange(() => setSystemMode(getSystemMode()))
  }, [])

  const setPreference = useCallback((next: ThemePreference) => {
    storePreference(next)
    setPreferenceState(next)
  }, [])

  return { preference, mode, setPreference }
}
