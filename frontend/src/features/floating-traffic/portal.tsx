import { useFloatingTraffic } from './hooks/useFloatingTraffic'
import { FloatingTrafficUI } from './ui/FloatingTrafficUI'

export function FloatingTrafficPortal() {
  const viewModel = useFloatingTraffic()

  return <FloatingTrafficUI {...viewModel} />
}
