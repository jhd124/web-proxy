import type { TrafficEntry } from '../types'

const SHELL_SINGLE_QUOTE_ESCAPE = `'\\''`

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, SHELL_SINGLE_QUOTE_ESCAPE)}'`
}

export function buildCurlCommand(entry: TrafficEntry): string {
  const commandParts: string[] = [
    'curl',
    '-X',
    shellQuote(entry.method),
    shellQuote(entry.url),
  ]

  for (const [headerKey, headerValue] of entry.requestHeaders) {
    commandParts.push('-H', shellQuote(`${headerKey}: ${headerValue}`))
  }

  if (entry.kind === 'http' && entry.requestBodyPreview) {
    commandParts.push('--data-raw', shellQuote(entry.requestBodyPreview))
  }

  return commandParts.join(' ')
}
