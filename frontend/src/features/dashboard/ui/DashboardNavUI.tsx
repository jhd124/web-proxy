import { dashboardTexts } from '../texts'
import s from './DashboardNavUI.module.css'

type Tab = 'traffic' | 'breakpoints'

type Props = {
  tab: Tab
  setTab: (t: Tab) => void
  overrideCount: number
  breakpointCount: number
  onOverridesClick: () => void
}

function tabClass(active: boolean): string {
  return active ? `${s.tab} ${s.tabOn}` : s.tab
}

export function DashboardNavUI({
  tab,
  setTab,
  overrideCount,
  breakpointCount,
  onOverridesClick,
}: Props) {
  const t = dashboardTexts.nav
  return (
    <nav className={s.tabs}>
      <button type="button" className={tabClass(tab === 'traffic')} onClick={() => setTab('traffic')}>
        {t.traffic}
      </button>
      <button type="button" className={s.tabLaunch} onClick={onOverridesClick}>
        {t.overrides}
        {overrideCount > 0 && <span className={s.tabCount}>{overrideCount}</span>}
      </button>
      <button
        type="button"
        className={tabClass(tab === 'breakpoints')}
        onClick={() => setTab('breakpoints')}
      >
        {t.breakpoints}
        {breakpointCount > 0 && (
          <span className={s.tabCount}>{breakpointCount}</span>
        )}
      </button>
    </nav>
  )
}
