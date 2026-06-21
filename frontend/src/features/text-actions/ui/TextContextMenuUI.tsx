import { useRef, type ReactNode } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useTextContextActions } from '../hooks/useTextContextActions'
import { textActionTexts } from '../texts'

type Props = {
  children: ReactNode
  fallbackText: string | (() => string)
}

export function TextContextMenuUI({ children, fallbackText }: Props) {
  const actions = useTextContextActions()
  const contextTextRef = useRef('')
  const selectionRangesRef = useRef<Range[]>([])

  const getFallbackText = () =>
    typeof fallbackText === 'function' ? fallbackText().trim() : fallbackText.trim()

  const readCurrentContextText = () => {
    const selectedText = getSelectedText()
    if (selectedText) return selectedText
    return getFallbackText()
  }

  const captureContextText = () => {
    contextTextRef.current = readCurrentContextText()
    selectionRangesRef.current = getSelectionRanges()
  }

  const restoreContextSelection = () => {
    restoreSelectionRanges(selectionRangesRef.current)
  }

  const getContextText = () => {
    const selectedText = getSelectedText()
    if (selectedText) return selectedText
    return contextTextRef.current.trim() || getFallbackText()
  }

  const runAction = (action: (text: string) => void) => {
    action(getContextText())
  }

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) {
          window.requestAnimationFrame(restoreContextSelection)
        }
      }}
    >
      <ContextMenuTrigger
        asChild
        className="select-text"
        onContextMenuCapture={captureContextText}
      >
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent aria-label={textActionTexts.menu.decodeFormat}>
        <ContextMenuItem onSelect={() => runAction(actions.openPageSearch)}>
          {textActionTexts.menu.search}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => runAction(actions.openGlobalSearch)}>
          {textActionTexts.menu.globalSearch}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => runAction(actions.openDecodeFormat)}>
          {textActionTexts.menu.decodeFormat}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => runAction(actions.openBrowserSearch)}>
          {textActionTexts.menu.browserSearch}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function getSelectedText(): string {
  if (typeof window === 'undefined') return ''
  return window.getSelection()?.toString().trim() ?? ''
}

function getSelectionRanges(): Range[] {
  if (typeof window === 'undefined') return []
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.toString().trim() === '') {
    return []
  }

  return Array.from({ length: selection.rangeCount }, (_, index) =>
    selection.getRangeAt(index).cloneRange(),
  )
}

function restoreSelectionRanges(ranges: Range[]): void {
  if (typeof window === 'undefined' || ranges.length === 0) return
  const selection = window.getSelection()
  if (!selection) return

  selection.removeAllRanges()
  ranges.forEach((range) => {
    selection.addRange(range)
  })
}
