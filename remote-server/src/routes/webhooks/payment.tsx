import { createFileRoute } from '@tanstack/react-router'
import { handlePaymentWebhook } from '../../payments/webhook'
import { getRemoteServerContext } from '../../serverContext'

export const Route = createFileRoute('/webhooks/payment')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { config, store } = getRemoteServerContext()
        return handlePaymentWebhook({ request, config, store })
      },
    },
  },
})
