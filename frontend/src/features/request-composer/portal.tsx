import { useRequestComposer } from './hooks/useRequestComposer'
import { RequestComposerUI } from './ui/RequestComposerUI'
import type { RequestComposerHistoryDetail } from '../../types'
import type { RequestComposerInitialRequest } from './types'

export interface RequestComposerPortalProps {
  initialRequest?: RequestComposerInitialRequest
  onSaveHistoryRequest?: (detail: RequestComposerHistoryDetail) => Promise<void>
  onCreateHistoryOverride?: (detail: RequestComposerHistoryDetail) => Promise<void>
}

export function RequestComposerPortal({
  initialRequest,
  onSaveHistoryRequest,
  onCreateHistoryOverride,
}: RequestComposerPortalProps) {
  const viewModel = useRequestComposer({
    initialRequest,
    onSaveHistoryRequest,
    onCreateHistoryOverride,
  })
  return <RequestComposerUI {...viewModel} />
}
