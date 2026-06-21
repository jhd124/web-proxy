import { describe, expect, it } from 'vitest'
import { decodeAndFormatText } from './decodeFormat'

describe('decodeAndFormatText', () => {
  it('formats json', () => {
    const result = decodeAndFormatText('{"name":"proxy","enabled":true}')

    expect(result.kind).toBe('json')
    expect(result.output).toBe('{\n  "name": "proxy",\n  "enabled": true\n}')
  })

  it('decodes encoded url components repeatedly', () => {
    const result = decodeAndFormatText('hello%2520world')

    expect(result.kind).toBe('urlComponent')
    expect(result.output).toBe('hello world')
  })

  it('formats urls with decoded query params', () => {
    const result = decodeAndFormatText(
      'https://example.com/search?q=hello%2520world&q=second&redirect=https%253A%252F%252Fapp.test%252Fhome',
    )

    expect(result.kind).toBe('url')
    expect(JSON.parse(result.output)).toEqual({
      url: 'https://example.com/search?q=hello world&q=second&redirect=https://app.test/home',
      origin: 'https://example.com',
      pathname: '/search',
      params: {
        q: ['hello world', 'second'],
        redirect: 'https://app.test/home',
      },
    })
  })

  it('recursively formats url params that contain urls', () => {
    const deepUrl = encodeURIComponent('https://deep.test/cb?x=1&x=2')
    const innerUrl = encodeURIComponent(
      `https://inner.test/path?target=${deepUrl}&ok=1`,
    )
    const result = decodeAndFormatText(`https://outer.test/go?next=${innerUrl}`)

    expect(result.kind).toBe('url')
    expect(JSON.parse(result.output)).toEqual({
      url: 'https://outer.test/go?next=https://inner.test/path?target=https://deep.test/cb?x=1&x=2&ok=1',
      origin: 'https://outer.test',
      pathname: '/go',
      params: {
        next: {
          url: 'https://inner.test/path?target=https://deep.test/cb?x=1&x=2&ok=1',
          origin: 'https://inner.test',
          pathname: '/path',
          params: {
            ok: '1',
            target: {
              url: 'https://deep.test/cb?x=1&x=2',
              origin: 'https://deep.test',
              pathname: '/cb',
              params: {
                x: ['1', '2'],
              },
            },
          },
        },
      },
    })
  })

  it('decodes base64 json', () => {
    const result = decodeAndFormatText('eyJvayI6dHJ1ZX0=')

    expect(result.kind).toBe('base64')
    expect(result.output).toBe('{\n  "ok": true\n}')
  })

  it('decodes jwt header and payload', () => {
    const result = decodeAndFormatText(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjMiLCJuYW1lIjoiVGVzdCJ9.signature',
    )

    expect(result.kind).toBe('jwt')
    expect(JSON.parse(result.output)).toEqual({
      header: {
        alg: 'HS256',
        typ: 'JWT',
      },
      payload: {
        sub: '123',
        name: 'Test',
      },
      signature: 'signature',
    })
  })

  it('returns unknown for unrecognized text', () => {
    const result = decodeAndFormatText('plain text')

    expect(result.kind).toBe('unknown')
    expect(result.output).toBe('plain text')
  })
})
