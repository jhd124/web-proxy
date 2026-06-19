import { useMemo, type ReactElement, type ReactNode } from 'react'

type HighlightTextProps = {
  text: string
  keywords: readonly string[]
  markClassName: string
}

type HighlightTextPart = {
  text: string
  isHighlighted: boolean
}

export function HighlightText({
  text,
  keywords,
  markClassName,
}: HighlightTextProps): ReactElement {
  const parts = useMemo(
    () => getHighlightedTextParts(text, keywords),
    [keywords, text],
  )

  return (
    <>
      {parts.map((part, index): ReactNode =>
        part.isHighlighted ? (
          <mark key={`${index}-${part.text}`} className={markClassName}>
            {part.text}
          </mark>
        ) : (
          <span key={`${index}-${part.text}`}>{part.text}</span>
        ),
      )}
    </>
  )
}

export function getHighlightedTextParts(
  text: string,
  keywords: readonly string[],
): HighlightTextPart[] {
  const pattern = buildHighlightPattern(keywords)
  if (!pattern) return [{ text, isHighlighted: false }]

  const parts: HighlightTextPart[] = []
  let lastIndex = 0
  for (const match of text.matchAll(pattern)) {
    const matchedText = match[0]
    const matchIndex = match.index ?? 0
    if (matchedText.length === 0) continue
    if (matchIndex > lastIndex) {
      parts.push({
        text: text.slice(lastIndex, matchIndex),
        isHighlighted: false,
      })
    }
    parts.push({ text: matchedText, isHighlighted: true })
    lastIndex = matchIndex + matchedText.length
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isHighlighted: false })
  }
  return parts.length > 0 ? parts : [{ text, isHighlighted: false }]
}

function buildHighlightPattern(keywords: readonly string[]): RegExp | null {
  const normalizedKeywords = [...new Set(keywords.map((keyword) => keyword.trim()))]
    .filter((keyword) => keyword.length > 0)
    .sort((left, right) => right.length - left.length)
  if (normalizedKeywords.length === 0) return null

  const pattern = normalizedKeywords
    .map((keyword) => escapeRegex(keyword).replace(/\\\./g, '[.．。]'))
    .join('|')
  return new RegExp(pattern, 'giu')
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
