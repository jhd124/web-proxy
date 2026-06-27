import { BreakpointsPanelPortal } from '../../breakpoints/portal'
import { HostsPanelPortal } from '../../hosts/portal'
import { OverrideEditorPortal } from '../../override-editor/portal'
import { RequestComposerPortal } from '../../request-composer/portal'
import { SavedRequestsPanelPortal } from '../../saved-requests/portal'
import { SettingsPanelPortal } from '../../settings/portal'
import { TrafficPanelPortal } from '../../traffic/portal'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import type { DashboardViewModel } from '../hooks/useDashboard'
import { DashboardHeaderUI } from './DashboardHeaderUI'
import { DashboardSidebarUI } from './DashboardSidebarUI'
import root from './DashboardUI.module.css'

export function DashboardUI(p: DashboardViewModel) {
  return (
    <div className={root.app}>
      <SidebarProvider defaultOpen={false} className={root.content}>
        <DashboardSidebarUI {...p} />
        <SidebarInset className={root.main}>
          <div className={root.mainBody}>
            {p.activeTab === 'traffic' && (
              <div className={root.trafficPage}>
                <DashboardHeaderUI
                  urlFilter={p.urlFilter}
                  setUrlFilter={p.setUrlFilter}
                  urlFilterTags={p.urlFilterTags}
                  commitUrlFilterInputAsTag={p.commitUrlFilterInputAsTag}
                  removeUrlFilterTag={p.removeUrlFilterTag}
                  popUrlFilterTag={p.popUrlFilterTag}
                  clearTraffic={p.clearTraffic}
                  trafficFilters={p.trafficFilters}
                  availableRequesterApps={p.availableRequesterApps}
                  toggleTrafficFilterValue={p.toggleTrafficFilterValue}
                  clearTrafficFilters={p.clearTrafficFilters}
                  hasTrafficFilters={p.hasTrafficFilters}
                  proxyListenAddress={p.proxyListenAddress}
                  capturePaused={p.capturePaused}
                  captureToggleSaving={p.captureToggleSaving}
                  wifiProxySaving={p.wifiProxySaving}
                  captureBrowsers={p.captureBrowsers}
                  captureBrowserLaunching={p.captureBrowserLaunching}
                  exportHarSaving={p.exportHarSaving}
                  onCaptureToggleClick={p.toggleCapturePaused}
                  onEnableWifiProxyClick={p.enableWifiHttpHttpsProxy}
                  onLaunchCaptureBrowser={p.launchLocalhostCaptureBrowser}
                  onFloatingTrafficEntryClick={p.openFloatingTrafficWindow}
                  onExportHarClick={p.exportFilteredTrafficAsHar}
                />
                <div className={root.tabPanel}>
                  <TrafficPanelPortal
                    testError={p.testError}
                    filteredEntries={p.filteredEntries}
                    matchedTrafficEntryIds={p.matchedTrafficEntryIds}
                    savedTrafficEntryIds={p.savedTrafficEntryIds}
                    matchedOverrideByEntryId={p.matchedOverrideByEntryId}
                    matchedBreakpointByEntryId={p.matchedBreakpointByEntryId}
                    selectedId={p.selectedId}
                    setSelectedId={p.setSelectedId}
                    selected={p.selected}
                    selectedIsEventStream={p.selectedIsEventStream}
                    searchKeywords={p.activeFilterKeywords}
                    onEntryCopyCurl={p.copyEntryCurl}
                    onEntrySaveRequest={p.saveEntryRequest}
                    onEntryOverride={p.openEntryOverrideDrawer}
                    onEntryAddBreakpoint={async (id) => {
                      p.addBreakpointFromEntry(id)
                    }}
                    onEntryOpenSavedRequest={p.openSavedRequestForEntry}
                    onEntryOpenMatchedOverride={p.openMatchedOverrideForEntry}
                    onEntryOpenMatchedBreakpoint={p.openMatchedBreakpointForEntry}
                  />
                </div>
              </div>
            )}
            {p.activeTab === 'override' && (
              <div className={root.tabPanel}>
                <OverrideEditorPortal
                  variant="embedded"
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
              </div>
            )}
            {p.activeTab === 'breakpoints' && (
              <div className={root.tabPanel}>
                <BreakpointsPanelPortal
                  variant="embedded"
                  closeBreakpointsPanel={p.closeBreakpointsPanel}
                  breakpointForm={p.breakpointForm}
                  setBreakpointForm={p.setBreakpointForm}
                  breakpointEntries={p.breakpointEntries}
                  pendingRequestIdByBreakpointId={p.pendingRequestIdByBreakpointId}
                  resumeRequest={p.resumeRequest}
                  resumeSaving={p.resumeSaving}
                  isBreakpointFormActive={p.isBreakpointFormActive}
                  selectedBreakpointId={p.selectedBreakpointId}
                  setSelectedBreakpointId={p.setSelectedBreakpointId}
                  startNewBreakpoint={p.startNewBreakpoint}
                  saveBreakpoint={p.saveBreakpoint}
                  selectedRequestOrigin={p.selectedRequestOrigin}
                  removeBreakpoint={p.removeBreakpoint}
                  setBreakpointEnabled={p.setBreakpointEnabled}
                  breakpointToggleSaving={p.breakpointToggleSaving}
                  highlightedBreakpointId={p.highlightedBreakpointId}
                />
              </div>
            )}
            {p.activeTab === 'saved' && (
              <div className={root.tabPanel}>
                <SavedRequestsPanelPortal
                  variant="embedded"
                  savedRequests={p.savedRequests}
                  selectedSavedRequestId={p.selectedSavedRequestId}
                  setSelectedSavedRequestId={p.setSelectedSavedRequestId}
                  closeSavedRequestsPanel={p.closeSavedRequestsPanel}
                  removeSavedRequest={p.removeSavedRequest}
                  clearSavedRequests={p.clearSavedRequests}
                />
              </div>
            )}
            {p.activeTab === 'request-composer' && (
              <div className={root.tabPanel}>
                <RequestComposerPortal />
              </div>
            )}
            {p.activeTab === 'hosts' && (
              <div className={root.tabPanel}>
                <HostsPanelPortal />
              </div>
            )}
            {p.activeTab === 'settings' && (
              <div className={root.tabPanel}>
                <SettingsPanelPortal />
              </div>
            )}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  )
}
