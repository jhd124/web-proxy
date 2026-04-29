import { BreakpointsPanelPortal } from '../../breakpoints/portal'
import { TrafficPanelPortal } from '../../traffic/portal'
import type { DashboardViewModel } from '../hooks/useDashboard'
import { DashboardHeaderUI } from './DashboardHeaderUI'
import { DashboardNavUI } from './DashboardNavUI'
import { MitmBannerUI } from './MitmBannerUI'
import root from './DashboardUI.module.css'

export function DashboardUI(p: DashboardViewModel) {
  return (
    <div className={root.app}>
      <DashboardHeaderUI
        wsStatus={p.wsStatus}
        urlFilterTrimmed={p.urlFilterTrimmed}
        filteredCount={p.filteredCount}
        totalCount={p.totalCount}
      />

      {p.mitmEnabled && (
        <MitmBannerUI mitmCaPemPath={p.mitmCaPemPath} />
      )}

      <DashboardNavUI
        tab={p.tab}
        setTab={p.setTab}
        overrideCount={p.overrideCount}
        breakpointCount={p.breakpointCount}
        onOverridesClick={p.onOverridesNavClick}
      />

      {p.tab === 'traffic' && (
        <TrafficPanelPortal
          urlFilter={p.urlFilter}
          setUrlFilter={p.setUrlFilter}
          testError={p.testError}
          clearTraffic={p.clearTraffic}
          filteredEntries={p.filteredEntries}
          selectedId={p.selectedId}
          setSelectedId={p.setSelectedId}
          selected={p.selected}
          selectedIsEventStream={p.selectedIsEventStream}
          openOverrideDrawer={p.openOverrideDrawer}
          addBreakpointFromSelected={p.addBreakpointFromSelected}
          resumeRequest={p.resumeRequest}
          resumeSaving={p.resumeSaving}
        />
      )}

      {p.tab === 'breakpoints' && (
        <BreakpointsPanelPortal
          breakpointForm={p.breakpointForm}
          setBreakpointForm={p.setBreakpointForm}
          breakpointEntries={p.breakpointEntries}
          addBreakpoint={p.addBreakpoint}
          removeBreakpoint={p.removeBreakpoint}
          setBreakpointEnabled={p.setBreakpointEnabled}
          breakpointToggleSaving={p.breakpointToggleSaving}
        />
      )}
    </div>
  )
}
