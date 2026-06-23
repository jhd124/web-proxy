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
  requestHistory: {
    sectionTitle: '请求编写器历史模板',
    description:
      '控制历史模板是否保存敏感请求头。默认不保存 Authorization、Cookie 等字段。',
    sensitiveHeaders: '保存敏感 headers',
    options: {
      disabled: '不保存',
      enabled: '保存',
    },
    saveFailed: (detail: string) => `保存设置失败：${detail}`,
    loadFailed: (detail: string) => `加载设置失败：${detail}`,
  },
} as const
