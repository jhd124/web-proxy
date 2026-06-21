import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { copyTextToClipboard } from '@/lib/clipboard'
import { showSuccessToast, showToast } from '@/lib/toast'
import { useAdvancedSearchContext } from '../advanced-search/advancedSearchContext'
import { usePageSearchContext } from '../page-search/pageSearchContext'
import { decodeAndFormatText, type DecodeFormatResult } from './decodeFormat'
import { TextActionsContext, type TextContextActions } from './textActionsContextValue'
import { textActionTexts } from './texts'
import { DecodeFormatDialogUI } from './ui/DecodeFormatDialogUI'

export function TextActionsProvider({
  children,
}: {
  children: ReactNode
}): ReactElement {
  const pageSearch = usePageSearchContext()
  const advancedSearch = useAdvancedSearchContext()
  const [decodeResult, setDecodeResult] = useState<DecodeFormatResult | null>(null)
  const [isDecodeDialogOpen, setIsDecodeDialogOpen] = useState(false)

  const normalizeActionText = useCallback((text: string): string => text.trim(), [])

  const openPageSearch = useCallback(
    (text: string) => {
      const query = normalizeActionText(text)
      if (!query) return
      pageSearch.showSearchBox(query)
    },
    [normalizeActionText, pageSearch],
  )

  const openGlobalSearch = useCallback(
    (text: string) => {
      const query = normalizeActionText(text)
      if (!query) return
      pageSearch.highlightQuery(query)
      advancedSearch.openAdvancedSearch({ query, submit: true })
    },
    [advancedSearch, normalizeActionText, pageSearch],
  )

  const openDecodeFormat = useCallback(
    (text: string) => {
      const query = normalizeActionText(text)
      if (!query) return
      setDecodeResult(decodeAndFormatText(query))
      setIsDecodeDialogOpen(true)
    },
    [normalizeActionText],
  )

  const openBrowserSearch = useCallback(
    (text: string) => {
      const query = normalizeActionText(text)
      if (!query) return
      window.open(
        `${textActionTexts.browserSearchEngine}${encodeURIComponent(query)}`,
        '_blank',
        'noopener,noreferrer',
      )
    },
    [normalizeActionText],
  )

  const handleCopyResult = useCallback(() => {
    if (!decodeResult?.output) return
    void copyTextToClipboard(decodeResult.output)
      .then(() => {
        showSuccessToast(textActionTexts.decodeFormat.copySuccess)
      })
      .catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error)
        showToast(textActionTexts.decodeFormat.copyFailed(detail), 'error')
      })
  }, [decodeResult])

  const value = useMemo<TextContextActions>(
    () => ({
      openPageSearch,
      openGlobalSearch,
      openDecodeFormat,
      openBrowserSearch,
    }),
    [openBrowserSearch, openDecodeFormat, openGlobalSearch, openPageSearch],
  )

  return (
    <TextActionsContext.Provider value={value}>
      {children}
      <DecodeFormatDialogUI
        open={isDecodeDialogOpen}
        result={decodeResult}
        onOpenChange={setIsDecodeDialogOpen}
        onCopyResult={handleCopyResult}
      />
    </TextActionsContext.Provider>
  )
}
