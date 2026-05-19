/** User-visible copy for the dashboard feature (key–value, single place of truth). */
export const dashboardTexts = {
  header: {
    downloadCaTooltip: 'Download MITM CA certificate (PEM)',
    downloadCaAriaLabel: 'Download MITM CA certificate',
    downloadCaFailed: (detail: string) =>
      `Could not download CA certificate: ${detail}`,
    openOverridesTooltip: 'Open overrides editor',
    openOverridesAriaLabel: 'Open overrides',
    openBreakpointsTooltip: 'Open breakpoints',
    openBreakpointsAriaLabel: 'Open breakpoints',
    openSavedRequestsTooltip: 'Open saved requests',
    openSavedRequestsAriaLabel: 'Open saved requests',
    openFloatingTrafficTooltip: 'Open floating traffic window',
    openFloatingTrafficAriaLabel: 'Open floating traffic window',
    floatingTrafficTitle: 'Proxy Traffic',
    openFloatingTrafficFailed: (detail: string) =>
      `Could not open floating traffic window: ${detail}`,
    proxyListenPrefix: '代理服务器监听在',
    proxyListenAriaLabel: (addr: string) => `代理服务器监听在 ${addr}`,
  },
  mitm: {
    linkPath: '/api/mitm/ca.pem',
    linkDownload: 'proxy-mitm-ca-rsa.pem',
  },
} as const
