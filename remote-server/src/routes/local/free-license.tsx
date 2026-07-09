import { createFileRoute } from '@tanstack/react-router'
import { useState, type CSSProperties, type FormEvent, type ReactElement } from 'react'
import {
  handleFreeLicense,
  isLocalOnlyRequest,
  localOnlyForbiddenResponse,
} from '../../serverContext'

type FreeLicenseResult = {
  ok: boolean
  licenseId?: string
  licenseKey?: string
  error?: string
}

const pageStyle: CSSProperties = {
  maxWidth: '760px',
  margin: '64px auto',
  padding: '0 24px',
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  color: '#111827',
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #d1d5db',
  borderRadius: '10px',
  padding: '12px 14px',
  fontSize: '15px',
}

export const Route = createFileRoute('/local/free-license')({
  server: {
    handlers: {
      GET: async ({ request, next }) => {
        if (!isLocalOnlyRequest(request)) return localOnlyForbiddenResponse()
        return next()
      },
      POST: async ({ request }) => {
        if (!isLocalOnlyRequest(request)) return localOnlyForbiddenResponse()
        return handleFreeLicense(request)
      },
    },
  },
  component: FreeLicensePage,
})

function FreeLicensePage(): ReactElement {
  const [customerEmail, setCustomerEmail] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [deviceLimit, setDeviceLimit] = useState('1')
  const [result, setResult] = useState<FreeLicenseResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setIsGenerating(true)
    setResult(null)
    try {
      const response = await fetch('/local/free-license', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          customerEmail: customerEmail.trim() || null,
          expiresAt: expiresAt || null,
          deviceLimit: Number.parseInt(deviceLimit, 10) || null,
        }),
      })
      const responseBody = (await response.json()) as FreeLicenseResult
      setResult(responseBody)
    } catch (error) {
      setResult({
        ok: false,
        error: error instanceof Error ? error.message : '生成失败',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <main style={pageStyle}>
      <p
        style={{
          margin: 0,
          color: '#059669',
          fontSize: '14px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        Local Only
      </p>
      <h1 style={{ margin: '12px 0', fontSize: '40px', lineHeight: 1.1 }}>
        生成免费 License
      </h1>
      <p style={{ margin: '0 0 28px', color: '#4b5563', fontSize: '16px' }}>
        该页面只允许从 localhost / 127.0.0.1 访问，生成的 License 使用 trial
        套餐限制。
      </p>

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'grid',
          gap: '16px',
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '24px',
          background: '#ffffff',
          boxShadow: '0 10px 30px rgba(17, 24, 39, 0.08)',
        }}
      >
        <label style={{ display: 'grid', gap: '8px', fontWeight: 600 }}>
          客户邮箱（可选）
          <input
            type="email"
            value={customerEmail}
            onChange={(event) => setCustomerEmail(event.target.value)}
            placeholder="customer@example.com"
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '8px', fontWeight: 600 }}>
          过期时间（可选）
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'grid', gap: '8px', fontWeight: 600 }}>
          设备数量
          <input
            min="1"
            type="number"
            value={deviceLimit}
            onChange={(event) => setDeviceLimit(event.target.value)}
            style={inputStyle}
          />
        </label>
        <button
          disabled={isGenerating}
          type="submit"
          style={{
            border: 0,
            borderRadius: '999px',
            padding: '12px 18px',
            background: isGenerating ? '#9ca3af' : '#111827',
            color: '#ffffff',
            cursor: isGenerating ? 'not-allowed' : 'pointer',
            fontSize: '15px',
            fontWeight: 700,
          }}
        >
          {isGenerating ? '生成中...' : '生成免费 License'}
        </button>
      </form>

      {result ? <LicenseResult result={result} /> : null}
    </main>
  )
}

function LicenseResult({ result }: { result: FreeLicenseResult }): ReactElement {
  if (!result.ok) {
    return (
      <p style={{ marginTop: '20px', color: '#b91c1c' }}>
        生成失败：{result.error ?? 'unknown'}
      </p>
    )
  }

  return (
    <section style={{ marginTop: '24px' }}>
      <h2 style={{ fontSize: '20px' }}>License Key</h2>
      <p style={{ color: '#4b5563' }}>ID: {result.licenseId}</p>
      <textarea
        readOnly
        value={result.licenseKey ?? ''}
        rows={6}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          border: '1px solid #d1d5db',
          borderRadius: '12px',
          padding: '14px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: '13px',
        }}
      />
    </section>
  )
}
