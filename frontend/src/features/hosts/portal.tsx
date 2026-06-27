import { useHostsManager } from './hooks/useHostsManager'
import { HostsPanelUI } from './ui/HostsPanelUI'

export function HostsPanelPortal() {
  const viewModel = useHostsManager()
  return <HostsPanelUI {...viewModel} />
}
