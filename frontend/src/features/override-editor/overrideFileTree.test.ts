import { describe, expect, it } from 'vitest'
import type { OverrideRule } from '../../types'
import { buildPathGroups, type PathNode } from './overrideFileTree'

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

function pathNode(
  rules: OverrideRule[],
  children: Record<string, PathNode> = {},
): PathNode {
  return { rules, children: new Map(Object.entries(children)) }
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

  it('groups by trimmed host and merges same host under one root', () => {
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
    const expected: { host: string; root: PathNode }[] = [
      {
        host: 'example.com',
        root: pathNode(
          [],
          {
            a: pathNode([r1]),
            b: pathNode([r2]),
          },
        ),
      },
    ]
    expect(buildPathGroups(overrides)).toEqual(expected)
  })

  it('normalizes path: leading slash, empty and "/" map to root; bare segment becomes one path level', () => {
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
    const expected: { host: string; root: PathNode }[] = [
      {
        host: 'h.test',
        root: pathNode(
          [r1, r2],
          {
            api: pathNode([r3]),
          },
        ),
      },
    ]
    expect(buildPathGroups(overrides)).toEqual(expected)
  })

  it('places path segments in a trie; rule ids sorted at each node', () => {
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
    const expected: { host: string; root: PathNode }[] = [
      {
        host: 'x.com',
        root: pathNode(
          [],
          {
            api: pathNode(
              [],
              {
                v1: pathNode([r1, r2]),
              },
            ),
            other: pathNode([r3]),
          },
        ),
      },
    ]
    expect(buildPathGroups(overrides)).toEqual(expected)
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
    const expected: { host: string; root: PathNode }[] = [
      {
        host: 'a.example',
        root: pathNode([r2], {}),
      },
      {
        host: 'B.example',
        root: pathNode([r1], {}),
      },
    ]
    expect(buildPathGroups(overrides)).toEqual(expected)
  })
})
