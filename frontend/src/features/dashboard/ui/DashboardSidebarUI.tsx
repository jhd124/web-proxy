import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Bookmark, NotebookPen, Replace, Settings, StepForward, Waves } from 'lucide-react'
import type { DashboardViewModel } from '../hooks/useDashboard'
import { dashboardTexts } from '../texts'
import root from './DashboardSidebarUI.module.css'

function formatActiveCount(activeCount: number): string {
  return activeCount > 9 ? 'N' : String(activeCount)
}

function buildNavTooltip(label: string, activeCount: number): string {
  if (activeCount <= 0) {
    return label
  }
  return dashboardTexts.sidebar.navTooltipWithActive(label, activeCount)
}

export function DashboardSidebarUI(viewModel: DashboardViewModel) {
  const activeTab = viewModel.activeTab
  const hasActiveBreakpoints = viewModel.activeBreakpointsCount > 0
  const hasActiveOverrides = viewModel.activeOverridesCount > 0

  return (
    <Sidebar side="left" collapsible="icon" aria-label="Dashboard sidebar">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeTab === 'traffic'}
              onClick={() => viewModel.navigateToTab('traffic')}
              tooltip="Traffic"
            >
              <Waves />
              <span>Traffic</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <div className={root.badgeAnchor}>
              <SidebarMenuButton
                isActive={activeTab === 'breakpoints'}
                onClick={viewModel.onBreakpointsNavClick}
                tooltip={buildNavTooltip(
                  'Breakpoint',
                  viewModel.activeBreakpointsCount,
                )}
                className={root.navButton}
              >
                <StepForward />
                <span>Breakpoint</span>
              </SidebarMenuButton>
              {hasActiveBreakpoints && (
                <span className={root.activeBadge} aria-label="Active breakpoints count">
                  <span className={root.badgeCountCompact}>
                    {formatActiveCount(viewModel.activeBreakpointsCount)}{' '}
                  </span>
                  <span className={root.badgeCountExpanded}>
                    {dashboardTexts.sidebar.activeCountLabel(
                      formatActiveCount(viewModel.activeBreakpointsCount),
                    )}
                  </span>
                </span>
              )}
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <div className={root.badgeAnchor}>
              <SidebarMenuButton
                isActive={activeTab === 'override'}
                onClick={viewModel.onOverridesNavClick}
                tooltip={buildNavTooltip('Override', viewModel.activeOverridesCount)}
                className={root.navButton}
              >
                <Replace />
                <span>Override</span>
              </SidebarMenuButton>
              {hasActiveOverrides && (
                <span className={root.activeBadge} aria-label="Active overrides count">
                  <span className={root.badgeCountCompact}>
                    {formatActiveCount(viewModel.activeOverridesCount)}
                  </span>
                  <span className={root.badgeCountExpanded}>
                    {dashboardTexts.sidebar.activeCountLabel(
                      formatActiveCount(viewModel.activeOverridesCount),
                    )}
                  </span>
                </span>
              )}
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeTab === 'saved'}
              onClick={viewModel.openSavedRequestsPanel}
              tooltip="Saved"
            >
              <Bookmark />
              <span>Saved</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeTab === 'request-composer'}
              onClick={viewModel.openRequestComposerPanel}
              tooltip="Request Composer"
            >
              <NotebookPen />
              <span>Request Composer</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent />
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeTab === 'settings'}
              onClick={viewModel.openSettingsPanel}
              tooltip="Settings"
            >
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
