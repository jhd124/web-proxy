/** User-visible copy for the dashboard feature (key–value, single place of truth). */
export const dashboardTexts = {
  sidebar: {
    activeCountLabel: (countLabel: string) => `${countLabel} active`,
    navTooltipWithActive: (label: string, count: number) =>
      `${label} (${count} ${count === 1 ? 'active item' : 'active items'})`,
  },
  header: {
    exportHarTooltip: 'Export filtered traffic as HAR',
    exportHarAriaLabel: 'Export filtered traffic as HAR',
    exportHarSuccess: (count: number) =>
      `Exported ${count} traffic ${count === 1 ? 'entry' : 'entries'} as HAR`,
    exportHarFailed: (detail: string) =>
      `Could not export HAR: ${detail}`,
    downloadCaTooltip: 'Download MITM CA certificate (PEM)',
    downloadCaAriaLabel: 'Download MITM CA certificate',
    downloadCaSuccess: 'Downloaded MITM CA certificate',
    downloadCaFailed: (detail: string) =>
      `Could not download CA certificate: ${detail}`,
    openOverridesTooltip: 'Open overrides editor',
    openOverridesAriaLabel: 'Open overrides',
    activeOverridesWarning: (count: number) =>
      `${count} override rule${count === 1 ? '' : 's'} active — matching requests use your mocked response.`,
    openBreakpointsTooltip: 'Open breakpoints',
    openBreakpointsAriaLabel: 'Open breakpoints',
    activeBreakpointsWarning: (count: number) =>
      `${count} breakpoint${count === 1 ? '' : 's'} active — matching requests pause until resumed.`,
    openSavedRequestsTooltip: 'Open saved requests',
    openSavedRequestsAriaLabel: 'Open saved requests',
    openFloatingTrafficTooltip: 'Open floating traffic window',
    openFloatingTrafficAriaLabel: 'Open floating traffic window',
    enableWifiProxyTooltip: 'Enable WiFi HTTP/HTTPS proxy',
    enableWifiProxyAriaLabel: 'Enable WiFi HTTP and HTTPS proxy',
    enableWifiProxySuccess: 'Enabled WiFi HTTP/HTTPS proxy',
    enableWifiProxyFailed: (detail: string) =>
      `Could not enable WiFi HTTP/HTTPS proxy: ${detail}`,
    launchCaptureBrowserTooltip: 'Launch browser to capture localhost',
    launchCaptureBrowserAriaLabel: 'Launch browser to capture localhost traffic',
    launchCaptureBrowserWith: (browserName: string) =>
      `Launch ${browserName} (captures localhost)`,
    captureBrowserMenuLabel: 'Choose a browser to capture localhost',
    captureBrowserLaunched: (browserName: string) =>
      `Launched ${browserName} with proxy + localhost capture`,
    captureBrowserFailed: (detail: string) =>
      `Could not launch capture browser: ${detail}`,
    captureBrowserMissingCa:
      'MITM CA is not ready yet (start with MITM=1 and wait for the CA)',
    missingProxyAddress: 'Proxy listen address is unavailable',
    desktopOnlyAction: 'This action is only available in desktop app',
    pauseCaptureTooltip: 'Pause traffic capture',
    pauseCaptureAriaLabel: 'Pause traffic capture',
    resumeCaptureTooltip: 'Resume traffic capture',
    resumeCaptureAriaLabel: 'Resume traffic capture',
    pauseCaptureSuccess: 'Paused traffic capture',
    resumeCaptureSuccess: 'Resumed traffic capture',
    pauseCaptureFailed: (detail: string) =>
      `Could not pause traffic capture: ${detail}`,
    resumeCaptureFailed: (detail: string) =>
      `Could not resume traffic capture: ${detail}`,
    floatingTrafficTitle: 'LeoProxy Traffic',
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
