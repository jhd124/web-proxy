export const savedRequestsTexts = {
  shell: {
    title: 'Saved requests',
    subtitle:
      'Requests saved from the detail view are kept locally in this browser.',
    closeAria: 'Close saved requests',
  },
  empty: 'No saved requests yet. Select a request and click Save request.',
  selectHint: 'Select a saved request from the list to view its details.',
  toggleHostGroup: (host: string) => `Show or hide saved requests for ${host}`,
  savedAt: (value: string) => `Saved ${value}`,
  originalAt: (value: string) => `Captured ${value}`,
  delete: 'Delete',
  deleteConfirm: 'Delete this saved request?',
  clearAll: 'Clear all',
  clearAllConfirm: 'Delete all saved requests?',
  request: 'Request',
  response: 'Response',
  body: 'Body',
  noResponse: 'No response data saved.',
  meta: (peer: string, kind: string, scheme: string, duration: string) =>
    `client ${peer} · ${kind} · ${scheme} · ${duration}`,
} as const
