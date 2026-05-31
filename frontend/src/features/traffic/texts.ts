export const trafficTexts = {
  clear: 'Clear',
  filterPlaceholder: 'Filter URL…',
  schemeHttps: 'HTTPS',
  connectTunnel: (url: string) => `${url} (TLS tunnel)`,
  connectMitmBypassed: (url: string) => `${url} (MITM bypassed, TLS tunnel)`,
  connectMitmHandshakeFailed: (url: string) => `${url} (MITM handshake failed)`,
  mitmHandshakeNote:
    'MITM: the client did not complete TLS to the proxy-issued certificate (pinning, unknown CA, or aborted connection).',
  mitmBypassedNote:
    'MITM was skipped for this host after a previous handshake failure. The CONNECT tunnel is shown, but encrypted paths and bodies are not visible.',
  tagPending: 'PEND',
  tagError: 'ERR',
  tagBypassed: 'BYPS',
  sectionRequest: 'Request',
  sectionResponse: 'Response',
  closeDetail: 'Close detail',
  saveRequest: 'Save request',
  requestSaved: 'Saved',
  copyCurl: 'Copy cURL',
  copyCurlSuccess: 'Copied cURL',
  copyCurlFailed: (detail: string) => `Could not copy cURL: ${detail}`,
  addBreakpoint: 'Add breakpoint',
  viewMatchedOverride: 'View matched override',
  viewMatchedBreakpoint: 'View matched breakpoint',
  resuming: 'Resuming…',
  resume: 'Resume',
  overrideResponse: 'Override response',
  pendingAtBreakpoint: (breakpointName: string | null) =>
    `Pending at breakpoint${breakpointName ? `: ${breakpointName}` : ''}. The client is waiting for you to resume this request.`,
  connectNote:
    'HTTPS uses a CONNECT tunnel; paths and bodies inside TLS are not visible to the proxy.',
  noResponseYet:
    'No response yet because this request is paused before override or upstream handling.',
  streamBodyNoPreview:
    'Streaming response — body fills in as chunks arrive (retained up to ~64 MB for the dashboard).',
  streamBodyHint:
    'Full streamed body retained for this view (up to ~64 MB). Updates while the connection stays open; the last chunk is shown when the stream ends.',
  body: 'Body',
  empty: {
    p1a: 'every HTTP request',
    p1b: 'every HTTPS CONNECT tunnel',
    p1c:
      'that clients send through this proxy. Only traffic routed via HTTP_PROXY/ HTTPS_PROXY or a system proxy appears here — not other programs on the machine.',
    p2a: 'Select a row, use',
    p2b: 'Test proxy',
    p2c: ', or point a client at the proxy (browsers need OS proxy settings or an extension; shell',
    p2d: 'export',
    p2e: 'alone does not affect them).',
  },
  clientMeta: (peer: string, kind: string, scheme: string, duration: string) =>
    `client ${peer} · ${kind} · ${scheme} · ${duration}`,
} as const
