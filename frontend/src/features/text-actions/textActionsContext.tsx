import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { copyTextToClipboard } from '@/lib/clipboard'
import { showSuccessToast, showToast } from '@/lib/toast'
import { isTauri } from '@/lib/tauriEnv'
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
      void openInBrowser(resolveBrowserTarget(query)).catch((error: unknown) => {
        const detail = error instanceof Error ? error.message : String(error)
        showToast(textActionTexts.decodeFormat.browserSearchFailed(detail), 'error')
      })
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

// 选中内容若是 URL 或带路径的域名，直接用浏览器打开；否则用默认搜索引擎查询。
function resolveBrowserTarget(query: string): string {
  const directUrl = toDirectUrl(query)
  if (directUrl) return directUrl
  return `${textActionTexts.browserSearchEngine}${encodeURIComponent(query)}`
}

function toDirectUrl(query: string): string | null {
  if (/\s/.test(query)) return null

  try {
    const parsed = new URL(query)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href
    }
    return null
  } catch {
    // 无协议的域名（如 example.com/path）补全为 https 后再校验。
    if (!/^[a-z0-9.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(query)) return null
    try {
      return new URL(`https://${query}`).href
    } catch {
      return null
    }
  }
}

async function openInBrowser(url: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_external_url', { url })
    return
  }

  const openedWindow = window.open(url, '_blank', 'noopener,noreferrer')
  if (!openedWindow) {
    throw new Error('window.open returned null')
  }
}
