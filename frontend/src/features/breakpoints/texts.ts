export const breakpointTexts = {
  shell: {
    title: 'Breakpoints',
    subtitle:
      'Pause matching HTTP requests before overrides or upstream fetches. Resume pending requests from the traffic detail view or the overrides editor.',
    closeAria: 'Close',
  },
  defaultFormName: 'Pause API request',
  defaultPathRegex: '^/api/',
  defaultRuleName: 'Breakpoint',
  /** New breakpoint name from override/traffic: Pause <name> */
  pauseName: (name: string) => `Pause ${name}`,
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
