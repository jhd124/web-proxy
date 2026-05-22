import { describe, expect, it } from 'vitest'
import { overrideBodyToImageSrc } from './overrideBodyImageSrc'

describe('overrideBodyToImageSrc', () => {
  it('accepts data URLs', () => {
    const src = 'data:image/png;base64,abcd'
    expect(overrideBodyToImageSrc(src, 'image/png')).toBe(src)
  })

  it('wraps raw base64 with mime from content-type', () => {
    expect(
      overrideBodyToImageSrc('aGVsbG8=', 'image/png'),
    ).toBe('data:image/png;base64,aGVsbG8=')
  })

  it('rejects binary placeholder and invalid payloads', () => {
    expect(
      overrideBodyToImageSrc('<binary 1024 bytes>', 'image/jpeg'),
    ).toBeNull()
    expect(overrideBodyToImageSrc('not-base64!', 'image/png')).toBeNull()
  })
})
