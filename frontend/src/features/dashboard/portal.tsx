import { useDashboard } from './hooks/useDashboard'
import { DashboardUI } from './ui/DashboardUI'

export function DashboardPortal() {
  const viewModel = useDashboard()
  return <DashboardUI {...viewModel} />
}
