import type { OverrideBodyFormatKind } from './overrideResponseLanguage'

type OverrideBodyFormatMode = 'beautify' | 'uglify'

type FormatBodyResponse = {
  body: string
}

async function formatOverrideBody(
  body: string,
  kind: OverrideBodyFormatKind,
  mode: OverrideBodyFormatMode,
): Promise<string> {
  const res = await fetch('/api/format-body', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, kind, mode }),
  })

  if (!res.ok) {
    throw new Error(await res.text())
  }

  const payload = (await res.json()) as FormatBodyResponse
  return payload.body
}

export async function beautifyOverrideBody(
  body: string,
  kind: OverrideBodyFormatKind,
): Promise<string> {
  return formatOverrideBody(body, kind, 'beautify')
}

export async function uglifyOverrideBody(
  body: string,
  kind: OverrideBodyFormatKind,
): Promise<string> {
  return formatOverrideBody(body, kind, 'uglify')
}
