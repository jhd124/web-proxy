type Tab = 'traffic' | 'mocks' | 'breakpoints'

type Props = {
  tab: Tab
  setTab: (t: Tab) => void
  overrideCount: number
  breakpointCount: number
  onOverridesClick: () => void
}

export function DashboardNav({
  tab,
  setTab,
  overrideCount,
  breakpointCount,
  onOverridesClick,
}: Props) {
  return (
    <nav className="tabs">
      <button
        type="button"
        className={tab === 'traffic' ? 'on' : ''}
        onClick={() => setTab('traffic')}
      >
        Traffic
      </button>
      <button
        type="button"
        className={tab === 'mocks' ? 'on' : ''}
        onClick={() => setTab('mocks')}
      >
        Mock rules
      </button>
      <button type="button" className="tab-launch" onClick={onOverridesClick}>
        Overrides
        {overrideCount > 0 && <span className="tab-count">{overrideCount}</span>}
      </button>
      <button
        type="button"
        className={tab === 'breakpoints' ? 'on' : ''}
        onClick={() => setTab('breakpoints')}
      >
        Breakpoints
        {breakpointCount > 0 && <span className="tab-count">{breakpointCount}</span>}
      </button>
    </nav>
  )
}
