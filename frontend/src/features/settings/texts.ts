import type { ThemePreference } from '../../theme/themeController'

/** 设置页文案（键值集中管理，单一来源） */
export const settingsTexts = {
  title: '设置',
  closeAria: '关闭设置',
  appearance: {
    sectionTitle: '外观',
    description: '切换浅色或深色界面，或跟随系统配色。',
    options: {
      system: '跟随系统',
      light: '浅色',
      dark: '深色',
    } satisfies Record<ThemePreference, string>,
  },
} as const
