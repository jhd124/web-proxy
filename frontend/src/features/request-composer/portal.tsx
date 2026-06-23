import { useRequestComposer } from './hooks/useRequestComposer'
import { RequestComposerUI } from './ui/RequestComposerUI'

export function RequestComposerPortal() {
  const viewModel = useRequestComposer()
  return <RequestComposerUI {...viewModel} />
}
