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
import {
  Bookmark,
  FileCog,
  NotebookPen,
  Replace,
  Settings,
  StepForward,
  Waves,
} from 'lucide-react'
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
  // 停止捕捉时规则不生效，隐藏红点与 tooltip 中的活跃数量
  const visibleBreakpointsCount = viewModel.capturePaused
    ? 0
    : viewModel.activeBreakpointsCount
  const visibleOverridesCount = viewModel.capturePaused
    ? 0
    : viewModel.activeOverridesCount
  const hasActiveBreakpoints = visibleBreakpointsCount > 0
  const hasActiveOverrides = visibleOverridesCount > 0

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
                tooltip={buildNavTooltip('Breakpoint', visibleBreakpointsCount)}
                className={root.navButton}
              >
                <StepForward />
                <span>Breakpoint</span>
              </SidebarMenuButton>
              {hasActiveBreakpoints && (
                <span className={root.activeBadge} aria-label="Active breakpoints count">
                  <span className={root.badgeCountCompact}>
                    {formatActiveCount(visibleBreakpointsCount)}{' '}
                  </span>
                  <span className={root.badgeCountExpanded}>
                    {dashboardTexts.sidebar.activeCountLabel(
                      formatActiveCount(visibleBreakpointsCount),
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
                tooltip={buildNavTooltip('Override', visibleOverridesCount)}
                className={root.navButton}
              >
                <Replace />
                <span>Override</span>
              </SidebarMenuButton>
              {hasActiveOverrides && (
                <span className={root.activeBadge} aria-label="Active overrides count">
                  <span className={root.badgeCountCompact}>
                    {formatActiveCount(visibleOverridesCount)}
                  </span>
                  <span className={root.badgeCountExpanded}>
                    {dashboardTexts.sidebar.activeCountLabel(
                      formatActiveCount(visibleOverridesCount),
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
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeTab === 'hosts'}
              onClick={viewModel.openHostsPanel}
              tooltip="Hosts"
            >
              <FileCog />
              <span>Hosts</span>
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
