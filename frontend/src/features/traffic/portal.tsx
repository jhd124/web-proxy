import { TrafficPanelUI } from './ui/TrafficPanelUI'
import type { TrafficPanelUIProps } from './types'

export function TrafficPanelPortal(p: TrafficPanelUIProps) {
  return <TrafficPanelUI {...p} />
}
