import {
  Sidebar,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Bookmark, Replace, Signpost, Waves } from 'lucide-react'
import type { DashboardViewModel } from '../hooks/useDashboard'

export function DashboardSidebarUI(viewModel: DashboardViewModel) {
  const activeTab = viewModel.activeTab

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
            <SidebarMenuButton
              isActive={activeTab === 'breakpoints'}
              onClick={viewModel.onBreakpointsNavClick}
              tooltip="Breakpoint"
            >
              <Signpost />
              <span>Breakpoint</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              isActive={activeTab === 'override'}
              onClick={viewModel.onOverridesNavClick}
              tooltip="Override"
            >
              <Replace />
              <span>Override</span>
            </SidebarMenuButton>
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
        </SidebarMenu>
      </SidebarHeader>
      <SidebarRail />
    </Sidebar>
  )
}
