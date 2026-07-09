import { createFileRoute } from '@tanstack/react-router'
import { handleLicenseDetail } from '../../serverContext'

export const Route = createFileRoute('/licenses/$licenseId')({
  server: {
    handlers: {
      GET: async ({ params }) => handleLicenseDetail(params.licenseId),
    },
  },
})
