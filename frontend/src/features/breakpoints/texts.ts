export const breakpointTexts = {
  defaultFormName: 'Pause API request',
  defaultPathRegex: '^/api/',
  defaultRuleName: 'Breakpoint',
  /** New breakpoint name from override/traffic: Pause <name> */
  pauseName: (name: string) => `Pause ${name}`,
  intro:
    'Breakpoints pause matching HTTP requests before overrides or upstream fetches. When a request is pending, resume it from the request detail view or from the Overrides response editor.',
  nameLabel: 'Name',
  originLabel: 'Origin',
  pathRegexLabel: 'Path regex',
  originPlaceholder: 'https://example.com',
  pathPlaceholder: '^/api/',
  add: 'Add breakpoint',
  noneYet: 'No breakpoints yet.',
  disabledPill: 'disabled',
  saving: 'Saving…',
  enable: 'Enable',
  disable: 'Disable',
  delete: 'Delete',
  deleteConfirm: 'Delete this breakpoint rule?',
} as const
