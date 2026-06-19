import { describe, expect, it } from 'vitest'
import type { TrafficEntrySummary } from '../../types'
import {
  entryMatchesUrlKeywords,
  parseTrafficFilterKeywords,
} from './trafficFilter'
import { getHighlightedTextParts } from './ui/HighlightText'

function entry(url: string): TrafficEntrySummary {
  return {
    id: 'request-1',
    at: '2026-06-17T00:00:00.000Z',
    peer: '127.0.0.1:1234',
    method: 'GET',
    url,
    scheme: 'https',
    host: 'static.example.com',
    path: '/assets/app.js',
    kind: 'http',
    pending: false,
    streamControllable: false,
    requesterAppName: 'Safari',
    websocket: false,
  }
}

describe('traffic URL keyword filter', () => {
  it('matches literal keywords that contain dots', () => {
    const keywords = parseTrafficFilterKeywords('example.com .js')
    const trafficEntry = entry('https://static.example.com/assets/app.js')

    expect(entryMatchesUrlKeywords(trafficEntry, keywords)).toBe(true)
  })

  it('normalizes dot variants before matching', () => {
    const keywords = parseTrafficFilterKeywords('static．example。com')
    const trafficEntry = entry('https://static.example.com/assets/app.js')

    expect(entryMatchesUrlKeywords(trafficEntry, keywords)).toBe(true)
  })

  it('matches decoded URL text', () => {
    const keywords = parseTrafficFilterKeywords('v1.0')
    const trafficEntry = entry('https://static.example.com/assets/v1%2E0/app.js')

    expect(entryMatchesUrlKeywords(trafficEntry, keywords)).toBe(true)
  })

  it('splits visible text into highlighted keyword parts', () => {
    const keywords = parseTrafficFilterKeywords('example.com .js')

    expect(
      getHighlightedTextParts('https://static.example.com/assets/app.js', keywords),
    ).toEqual([
      { text: 'https://static.', isHighlighted: false },
      { text: 'example.com', isHighlighted: true },
      { text: '/assets/app', isHighlighted: false },
      { text: '.js', isHighlighted: true },
    ])
  })
})
