import { BreakpointsPanelPortal } from '../../breakpoints/portal'
import { OverrideEditorPortal } from '../../override-editor/portal'
import { TrafficPanelPortal } from '../../traffic/portal'
import type { DashboardViewModel } from '../hooks/useDashboard'
import { DashboardHeaderUI } from './DashboardHeaderUI'
import root from './DashboardUI.module.css'

export function DashboardUI(p: DashboardViewModel) {
  return (
    <div className={root.app}>
      <DashboardHeaderUI
        proxyListenAddress={p.proxyListenAddress}
        onBreakpointsEntryClick={p.onBreakpointsNavClick}
        onOverridesEntryClick={p.onOverridesNavClick}
      />

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

      {p.breakpointsOpen && (
        <BreakpointsPanelPortal
          closeBreakpointsPanel={p.closeBreakpointsPanel}
          breakpointForm={p.breakpointForm}
          setBreakpointForm={p.setBreakpointForm}
          breakpointEntries={p.breakpointEntries}
          addBreakpoint={p.addBreakpoint}
          removeBreakpoint={p.removeBreakpoint}
          setBreakpointEnabled={p.setBreakpointEnabled}
          breakpointToggleSaving={p.breakpointToggleSaving}
        />
      )}

      {p.overridesPanel.state === 'edit' && (
        <OverrideEditorPortal
          closeOverrideDrawer={p.closeOverrideDrawer}
          saveOverride={p.saveOverride}
          overrideError={p.overrideError}
          requestPanelFocusKey={p.requestPanelFocusKey}
          overrideFileInputRef={p.overrideFileInputRef}
          overrideForm={p.overrideForm}
          setOverrideForm={p.setOverrideForm}
          overrideEntries={p.overrideEntries}
          startNewOverride={p.startNewOverride}
          openOverrideEditorForKey={p.openOverrideEditorForKey}
          overrideToggleSaving={p.overrideToggleSaving}
          setOverrideEnabled={p.setOverrideEnabled}
          deleteOverrideRule={p.deleteOverrideRule}
          selected={p.selected}
          selectedMatchingOverride={p.selectedMatchingOverride}
          overrideEditingId={p.overrideEditingId}
          selectedCanControlStream={p.selectedCanControlStream}
          resumeRequest={p.resumeRequest}
          resumeSaving={p.resumeSaving}
          addBreakpointFromOverride={p.addBreakpointFromOverride}
          streamActionSaving={p.streamActionSaving}
          playControlledStream={p.playControlledStream}
          pauseControlledStream={p.pauseControlledStream}
          computedOverrideId={p.computedOverrideId}
        />
      )}
    </div>
  )
}
