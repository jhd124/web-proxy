import { describe, expect, it } from 'vitest'
import type { OverrideRule } from '../../types'
import { buildPathGroups } from './overrideFileTree'

function rule(
  partial: Partial<OverrideRule> & Pick<OverrideRule, 'id'>,
): OverrideRule {
  return {
    enabled: true,
    status: 200,
    headers: [],
    body: '',
    matchRequestHeaders: [],
    matchQuery: [],
    ...partial,
  }
}

describe('buildPathGroups', () => {
  it('returns empty array for empty input', () => {
    expect(buildPathGroups([])).toEqual([])
  })

  it('drops rules with missing or blank host', () => {
    const overrides: OverrideRule[] = [
      rule({ id: '1', matchHost: null }),
      rule({ id: '2', matchHost: '' }),
      rule({ id: '3', matchHost: '   ' }),
    ]
    expect(buildPathGroups(overrides)).toEqual([])
  })

  it('groups by trimmed host and sorts rules by path', () => {
    const r1 = rule({
      id: '1',
      matchHost: '  example.com  ',
      matchPath: '/a',
    })
    const r2 = rule({
      id: '2',
      matchHost: 'example.com',
      matchPath: '/b',
    })
    const overrides: OverrideRule[] = [r1, r2]
    expect(buildPathGroups(overrides)).toEqual([
      { host: 'example.com', rules: [r1, r2] },
    ])
  })

  it('sorts paths with normalizePath; ties by rule id', () => {
    const r1 = rule({
      id: '1',
      matchHost: 'h.test',
      matchPath: '/',
    })
    const r2 = rule({
      id: '2',
      matchHost: 'h.test',
      matchPath: '',
    })
    const r3 = rule({
      id: '3',
      matchHost: 'h.test',
      matchPath: 'api',
    })
    const overrides: OverrideRule[] = [r1, r2, r3]
    expect(buildPathGroups(overrides)).toEqual([
      { host: 'h.test', rules: [r1, r2, r3] },
    ])
  })

  it('orders by path; same path uses id for stable order', () => {
    const r1 = rule({
      id: '1',
      matchHost: 'x.com',
      matchPath: '/api/v1',
    })
    const r2 = rule({
      id: '2',
      matchHost: 'x.com',
      matchPath: '/api/v1',
    })
    const r3 = rule({
      id: '3',
      matchHost: 'x.com',
      matchPath: '/other',
    })
    const overrides: OverrideRule[] = [r1, r2, r3]
    expect(buildPathGroups(overrides)).toEqual([
      { host: 'x.com', rules: [r1, r2, r3] },
    ])
  })

  it('sorts host groups with localeCompare (case-insensitive base)', () => {
    const r1 = rule({
      id: '1',
      matchHost: 'B.example',
      matchPath: '/',
    })
    const r2 = rule({
      id: '2',
      matchHost: 'a.example',
      matchPath: '/',
    })
    const overrides: OverrideRule[] = [r1, r2]
    expect(buildPathGroups(overrides)).toEqual([
      { host: 'a.example', rules: [r2] },
      { host: 'B.example', rules: [r1] },
    ])
  })
})
