/** User-visible copy for the dashboard feature (key–value, single place of truth). */
export const dashboardTexts = {
  header: {
    title: 'Proxy dashboard',
    wsPill: (status: 'connecting' | 'open' | 'closed') => `WS ${status}`,
    countFiltered: (filtered: number, total: number) =>
      `${filtered} / ${total} shown`,
    countAll: (total: number) => `${total} captured`,
  },
  nav: {
    traffic: 'Traffic',
    overrides: 'Overrides',
    breakpoints: 'Breakpoints',
  },
  mitm: {
    strong: 'HTTPS decryption (MITM) is on.',
    beforeLink:
      'Install the local CA so browsers trust proxied TLS: open',
    linkPath: '/api/mitm/ca.pem',
    linkDownload: 'proxy-mitm-ca.pem',
    afterLink:
      'and add it to your system keychain (macOS: Keychain Access → import → always trust). Then restart the browser. Without the CA, HTTPS sites will show certificate errors.',
    desktopMacInstall:
      'Add to System keychain (macOS, admin password)…',
    desktopOpenFile: 'Open certificate file…',
    desktopInstallFailed: (detail: string) =>
      `Could not install CA: ${detail}`,
    desktopOpenFailed: (detail: string) => `Could not open file: ${detail}`,
  },
} as const
