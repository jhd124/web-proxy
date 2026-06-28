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
  billing: {
    sectionTitle: 'License / 付费功能',
    description: '试用版断点、Override、Saved Requests 最多各添加 1 条。激活后可解锁更多配额。',
    loading: '加载中',
    trial: '当前为试用版',
    activated: (licenseId: string) =>
      licenseId ? `已激活：${licenseId}` : '已激活',
    plan: {
      trial: '试用版',
      pro: 'Pro',
    },
    features: {
      breakpoints: '断点',
      overrides: 'Override',
      savedRequests: 'Saved Requests',
    },
    unlimited: '不限',
    licensePlaceholder: '粘贴 License Key',
    activate: '激活',
    activating: '激活中',
    purchase: '购买 License',
    emptyLicenseKey: '请输入 License Key',
    activateSucceeded: 'License 激活成功',
    activateFailed: (detail: string) => `License 激活失败：${detail}`,
    loadFailed: (detail: string) => `加载 License 状态失败：${detail}`,
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
