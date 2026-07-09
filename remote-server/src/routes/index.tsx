import { createFileRoute } from '@tanstack/react-router'
import type { ReactElement } from 'react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage(): ReactElement {
  return (
    <main
      style={{
        maxWidth: '720px',
        margin: '80px auto',
        padding: '0 24px',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: '#111827',
      }}
    >
      <p
        style={{
          margin: 0,
          color: '#2563eb',
          fontSize: '14px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        TanStack SSR
      </p>
      <h1 style={{ margin: '12px 0', fontSize: '42px', lineHeight: 1.1 }}>
        Proxy License Server
      </h1>
      <p style={{ margin: 0, color: '#4b5563', fontSize: '18px', lineHeight: 1.7 }}>
        支付完成后，服务会签发 License Key。请复制 License Key 到桌面应用内激活。
      </p>
      <p style={{ marginTop: '24px' }}>
        <a href="/local/free-license" style={{ color: '#2563eb', fontWeight: 700 }}>
          本地生成免费 License
        </a>
      </p>
    </main>
  )
}
