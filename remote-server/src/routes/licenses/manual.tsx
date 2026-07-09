import { createFileRoute } from '@tanstack/react-router'
import { handleManualLicense } from '../../serverContext'

export const Route = createFileRoute('/licenses/manual')({
  server: {
    handlers: {
      POST: async ({ request }) => handleManualLicense(request),
    },
  },
})
