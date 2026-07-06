import { useRequestComposer } from './hooks/useRequestComposer'
import { RequestComposerUI } from './ui/RequestComposerUI'
import type { RequestComposerHistoryDetail } from '../../types'

export interface RequestComposerPortalProps {
  onSaveHistoryRequest?: (detail: RequestComposerHistoryDetail) => Promise<void>
  onCreateHistoryOverride?: (detail: RequestComposerHistoryDetail) => Promise<void>
}

export function RequestComposerPortal({
  onSaveHistoryRequest,
  onCreateHistoryOverride,
}: RequestComposerPortalProps) {
  const viewModel = useRequestComposer({
    onSaveHistoryRequest,
    onCreateHistoryOverride,
  })
  return <RequestComposerUI {...viewModel} />
}
