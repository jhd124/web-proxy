// 主题偏好控制：偏好持久化、系统配色解析、写入 <html data-theme>。
// 不依赖 React，便于在 hook 与首帧脚本之外的场景复用。

export type ThemePreference = 'system' | 'light' | 'dark'
export type ThemeMode = 'light' | 'dark'

const STORAGE_KEY = 'proxy-theme-preference'
const DARK_QUERY = '(prefers-color-scheme: dark)'

// 读取已保存的主题偏好，非法值回退为跟随系统
export function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored
    }
  } catch {
    /* ignore storage 不可用 */
  }
  return 'system'
}

// 持久化主题偏好
export function storePreference(preference: ThemePreference): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    /* ignore storage 不可用 */
  }
}

// 当前系统配色
export function getSystemMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

// 将偏好解析为具体的浅/深模式
export function resolveThemeMode(preference: ThemePreference): ThemeMode {
  return preference === 'system' ? getSystemMode() : preference
}

// 解析偏好并写入 <html data-theme>，返回最终模式
export function applyThemePreference(preference: ThemePreference): ThemeMode {
  const mode = resolveThemeMode(preference)
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = mode
  }
  return mode
}

// 订阅系统配色变化（仅在跟随系统时需要），返回清理函数
export function subscribeSystemThemeChange(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const mediaQueryList = window.matchMedia(DARK_QUERY)
  const handleChange = () => onChange()
  mediaQueryList.addEventListener('change', handleChange)
  return () => mediaQueryList.removeEventListener('change', handleChange)
}
