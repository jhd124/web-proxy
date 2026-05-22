import { describe, expect, it } from 'vitest'
import {
  contentTypeToFormatKind,
  contentTypeToMonacoLanguage,
  getResponseContentType,
} from './overrideResponseLanguage'

describe('getResponseContentType', () => {
  it('reads Content-Type from response headers text', () => {
    const text = 'Cache-Control: no-store\nContent-Type: application/json; charset=utf-8'
    expect(getResponseContentType(text)).toBe(
      'application/json; charset=utf-8',
    )
  })
})

describe('contentTypeToMonacoLanguage', () => {
  it('maps common MIME types', () => {
    expect(contentTypeToMonacoLanguage('application/json')).toBe('json')
    expect(contentTypeToMonacoLanguage('text/javascript')).toBe('javascript')
    expect(contentTypeToMonacoLanguage('text/html; charset=utf-8')).toBe('html')
    expect(contentTypeToMonacoLanguage('')).toBe('plaintext')
  })
})

describe('contentTypeToFormatKind', () => {
  it('enables format only for json, js, html', () => {
    expect(contentTypeToFormatKind('application/json')).toBe('json')
    expect(contentTypeToFormatKind('application/javascript')).toBe('javascript')
    expect(contentTypeToFormatKind('text/html')).toBe('html')
    expect(contentTypeToFormatKind('text/plain')).toBeNull()
  })
})
