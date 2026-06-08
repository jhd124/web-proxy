import { useVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { ArrowUpToLine } from 'lucide-react'
import type { TrafficEntry } from '../../../types'
import { trafficTexts as t } from '../texts'
import s from './TrafficVirtualListUI.module.css'

const ROW_HEIGHT_PX = 40
const TOP_STABLE_THRESHOLD_PX = 8
const BACK_TO_TOP_THRESHOLD_PX = 160

export type TrafficVirtualListTagTexts = {
  tagError: string
  tagBypassed: string
  tagPending: string
}

export type TrafficVirtualListUIProps = {
  entries: TrafficEntry[]
  matchedEntryIds?: ReadonlySet<string>
  savedEntryIds?: ReadonlySet<string>
  matchedOverrideByEntryId?: ReadonlyMap<string, string>
  matchedBreakpointByEntryId?: ReadonlyMap<string, string>
  selectedId: string | null
  onSelect: (id: string) => void
  onCopyCurl: (id: string) => void
  onSaveRequest: (id: string) => Promise<void>
  onOpenSavedRequest: (id: string) => void
  onOverride: (id: string) => void
  onOpenMatchedOverride: (id: string) => void
  onAddBreakpoint: (id: string) => Promise<void>
  onOpenMatchedBreakpoint: (id: string) => void
  onReplay: (id: string) => Promise<void>
  onEntryDoubleClick?: (id: string) => void
  emptyText?: string
  className?: string
  tagTexts?: TrafficVirtualListTagTexts
}

export function TrafficVirtualListUI({
  entries,
  matchedEntryIds,
  savedEntryIds,
  matchedOverrideByEntryId,
  matchedBreakpointByEntryId,
  selectedId,
  onSelect,
  onCopyCurl,
  onSaveRequest,
  onOpenSavedRequest,
  onOverride,
  onOpenMatchedOverride,
  onAddBreakpoint,
  onOpenMatchedBreakpoint,
  onReplay,
  onEntryDoubleClick,
  emptyText,
  className,
  tagTexts,
}: TrafficVirtualListUIProps): ReactElement {
  const tags = tagTexts ?? {
    tagError: t.tagError,
    tagBypassed: t.tagBypassed,
    tagPending: t.tagPending,
  }
  const displayEntries = useMemo(() => [...entries].reverse(), [entries])
  const parentRef = useRef<HTMLDivElement>(null)
  const previousDisplayEntriesRef = useRef<TrafficEntry[]>(displayEntries)
  const previousScrollTopRef = useRef(0)
  const [contextMenuState, setContextMenuState] = useState<{
    entryId: string | null
    x: number
    y: number
  }>({
    entryId: null,
    x: 0,
    y: 0,
  })
  const [showBackToTop, setShowBackToTop] = useState(false)

  const virtualizer = useVirtualizer({
    count: displayEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 16,
  })

  useLayoutEffect(() => {
    if (!selectedId) return
    const selectedIndex = displayEntries.findIndex((entry) => entry.id === selectedId)
    if (selectedIndex < 0) return
    virtualizer.scrollToIndex(selectedIndex, { align: 'auto' })
  }, [displayEntries, selectedId, virtualizer])

  useLayoutEffect(() => {
    const parent = parentRef.current
    const previousDisplayEntries = previousDisplayEntriesRef.current
    if (!parent) {
      previousDisplayEntriesRef.current = displayEntries
      return
    }

    const previousScrollTop = previousScrollTopRef.current
    const isBrowsingHistory = previousScrollTop > TOP_STABLE_THRESHOLD_PX
    if (isBrowsingHistory && previousDisplayEntries.length > 0) {
      const previousAnchorIndex = Math.floor(previousScrollTop / ROW_HEIGHT_PX)
      const previousAnchor = previousDisplayEntries[previousAnchorIndex]
      if (previousAnchor) {
        const nextAnchorIndex = displayEntries.findIndex(
          (entry) => entry.id === previousAnchor.id,
        )
        if (nextAnchorIndex >= 0) {
          const anchorOffset = previousScrollTop - previousAnchorIndex * ROW_HEIGHT_PX
          parent.scrollTop = nextAnchorIndex * ROW_HEIGHT_PX + anchorOffset
        }
      }
    }

    previousDisplayEntriesRef.current = displayEntries
    previousScrollTopRef.current = parent.scrollTop
  }, [displayEntries])

  if (displayEntries.length === 0) {
    if (!emptyText) {
      return <div className={className} aria-hidden />
    }
    return <p className={`small muted ${s.empty}`}>{emptyText}</p>
  }

  const scrollerClass = className ? `${s.scroller} ${className}` : s.scroller
  const activeContextEntryId = contextMenuState.entryId ?? selectedId
  const contextMenuEntry =
    activeContextEntryId == null
      ? null
      : displayEntries.find((entry) => entry.id === activeContextEntryId) ?? null

  return (
    <ContextMenu
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          setContextMenuState((prev) => ({ ...prev, entryId: null }))
        }
      }}
    >
      <ContextMenuTrigger asChild>
        <div className={s.scrollerWrap}>
          <div
            ref={parentRef}
            className={scrollerClass}
            tabIndex={0}
            onScroll={(event) => {
              const scrollTop = event.currentTarget.scrollTop
              previousScrollTopRef.current = scrollTop
              setShowBackToTop(scrollTop > BACK_TO_TOP_THRESHOLD_PX)
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
              event.preventDefault()
              if (displayEntries.length === 0) return

              const selectedIndex = selectedId
                ? displayEntries.findIndex((entry) => entry.id === selectedId)
                : -1
              if (selectedIndex < 0) {
                onSelect(displayEntries[0].id)
                return
              }

              const nextIndex =
                event.key === 'ArrowUp'
                  ? Math.max(selectedIndex - 1, 0)
                  : Math.min(selectedIndex + 1, displayEntries.length - 1)
              if (nextIndex === selectedIndex) return
              const nextEntry = displayEntries[nextIndex]
              if (!nextEntry) return
              onSelect(nextEntry.id)
            }}
          >
            <ul
              className={s.list}
              style={{ height: virtualizer.getTotalSize() }}
              aria-label="Traffic"
            >
              {virtualizer.getVirtualItems().map((virtualRow) => {
                const entry = displayEntries[virtualRow.index]
                if (!entry) return null

                const httpCodeText = entry.responseStatus != null ? String(entry.responseStatus) : '—'
                const contentType = getEntryContentType(entry)
                const appName = getRequesterAppName(entry)
                const rowStatusLabel = getRowStatusLabel(entry, tags)
                const hasMatchedRule = Boolean(
                  entry.overrideMatchId ||
                    entry.breakpointMatchId ||
                    matchedEntryIds?.has(entry.id),
                )

                return (
                  <li
                    key={entry.id}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: virtualRow.size,
                      transform: `translateY(${virtualRow.start}px)`,
                      outline: 'none',
                      outlineWidth: 0,
                    }}
                  >
                    <button
                      type="button"
                      className={`${s.row} ${selectedId === entry.id ? s.rowActive : ''} ${hasMatchedRule ? s.rowMatched : ''}`}
                      style={{ height: virtualRow.size }}
                      onClick={() => {
                        onSelect(entry.id)
                      }}
                      onContextMenu={(event) => {
                        onSelect(entry.id)
                        setContextMenuState({
                          entryId: entry.id,
                          x: event.clientX,
                          y: event.clientY,
                        })
                      }}
                      onDoubleClick={
                        onEntryDoubleClick
                          ? () => onEntryDoubleClick(entry.id)
                          : undefined
                      }
                    >
                      <span className={s.url} title={entry.url}>
                        {entry.url}
                      </span>
                      <span className={s.code} title={rowStatusLabel}>
                        {httpCodeText}
                      </span>
                      <span className={s.method} title={entry.method}>
                        {entry.method}
                      </span>
                      <span className={s.contentType} title={contentType}>
                        {contentType}
                      </span>
                      <span className={s.app} title={appName}>
                        {appName}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
          <button
            type="button"
            className={`${s.backToTop} ${showBackToTop ? s.backToTopVisible : ''}`}
            onClick={() => {
              parentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            aria-label={t.backToTop}
            title={t.backToTop}
          >
            <ArrowUpToLine className={s.backToTopIcon} aria-hidden />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent
        key={`${contextMenuState.entryId ?? 'none'}-${contextMenuState.x}-${contextMenuState.y}`}
        aria-label={t.rowMenuOpen}
      >
        <ContextMenuItem
          disabled={!contextMenuEntry}
          onSelect={() => {
            if (!contextMenuEntry) return
            onCopyCurl(contextMenuEntry.id)
          }}
        >
          {t.rowMenuCopyCurl}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!contextMenuEntry}
          onSelect={() => {
            if (!contextMenuEntry) return
            const hasSavedRequest = savedEntryIds?.has(contextMenuEntry.id) === true
            if (hasSavedRequest) {
              onOpenSavedRequest(contextMenuEntry.id)
              return
            }
            void onSaveRequest(contextMenuEntry.id)
          }}
        >
          {contextMenuEntry && savedEntryIds?.has(contextMenuEntry.id)
            ? t.rowMenuOpenSavedRequest
            : t.rowMenuSaveRequest}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!contextMenuEntry || contextMenuEntry.kind !== 'http'}
          onSelect={() => {
            if (!contextMenuEntry) return
            const hasMatchedOverride =
              Boolean(contextMenuEntry.overrideMatchId) ||
              matchedOverrideByEntryId?.has(contextMenuEntry.id) === true
            if (hasMatchedOverride) {
              onOpenMatchedOverride(contextMenuEntry.id)
              return
            }
            onOverride(contextMenuEntry.id)
          }}
        >
          {contextMenuEntry &&
          (Boolean(contextMenuEntry.overrideMatchId) ||
            matchedOverrideByEntryId?.has(contextMenuEntry.id))
            ? t.rowMenuViewMatchedOverride
            : t.rowMenuOverride}
        </ContextMenuItem>
        <ContextMenuItem
          disabled={!contextMenuEntry || contextMenuEntry.kind !== 'http'}
          onSelect={() => {
            if (!contextMenuEntry) return
            const hasMatchedBreakpoint =
              Boolean(contextMenuEntry.breakpointMatchId) ||
              matchedBreakpointByEntryId?.has(contextMenuEntry.id) === true
            if (hasMatchedBreakpoint) {
              onOpenMatchedBreakpoint(contextMenuEntry.id)
              return
            }
            void onAddBreakpoint(contextMenuEntry.id)
          }}
        >
          {contextMenuEntry &&
          (Boolean(contextMenuEntry.breakpointMatchId) ||
            matchedBreakpointByEntryId?.has(contextMenuEntry.id))
            ? t.rowMenuViewMatchedBreakpoint
            : t.rowMenuAddBreakpoint}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!contextMenuEntry || contextMenuEntry.kind !== 'http'}
          onSelect={() => {
            if (!contextMenuEntry) return
            void onReplay(contextMenuEntry.id)
          }}
        >
          {t.rowMenuReplay}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function getEntryContentType(entry: TrafficEntry): string {
  const responseContentType = entry.responseHeaders?.find(
    ([headerName]) => headerName.toLowerCase() === 'content-type',
  )?.[1]
  if (responseContentType) return normalizeContentTypeLabel(responseContentType)
  const requestContentType = entry.requestHeaders.find(
    ([headerName]) => headerName.toLowerCase() === 'content-type',
  )?.[1]
  if (requestContentType) return normalizeContentTypeLabel(requestContentType)
  return '—'
}

function getRowStatusLabel(entry: TrafficEntry, tags: TrafficVirtualListTagTexts): string {
  if (entry.error) return tags.tagError
  if (entry.pending) return tags.tagPending
  if (entry.mitmBypassed) return tags.tagBypassed
  if (entry.responseStatus != null) return `HTTP ${entry.responseStatus}`
  return 'HTTP -'
}

function normalizeContentTypeLabel(contentTypeValue: string): string {
  const mediaType = contentTypeValue
    .toLowerCase()
    .split(';')[0]
    ?.trim()
  if (!mediaType) return '—'
  const subtypePart = mediaType.includes('/') ? mediaType.split('/')[1] : mediaType
  if (!subtypePart) return mediaType
  const normalizedSubtype = subtypePart.includes('+')
    ? subtypePart.split('+').pop() || subtypePart
    : subtypePart
  if (normalizedSubtype === 'x-javascript' || normalizedSubtype === 'ecmascript') {
    return 'javascript'
  }
  if (normalizedSubtype === 'xhtml+xml') return 'html'
  return normalizedSubtype
}

function getRequesterAppName(entry: TrafficEntry): string {
  if (entry.appName && entry.appName.trim()) return entry.appName.trim()
  const userAgent = entry.requestHeaders.find(
    ([headerName]) => headerName.toLowerCase() === 'user-agent',
  )?.[1]
  if (!userAgent) return entry.peer || '—'
  const normalizedUserAgent = userAgent.toLowerCase()
  if (normalizedUserAgent.includes('edg/')) return 'Microsoft Edge'
  if (normalizedUserAgent.includes('chrome/') && !normalizedUserAgent.includes('edg/')) {
    return 'Google Chrome'
  }
  if (normalizedUserAgent.includes('firefox/')) return 'Mozilla Firefox'
  if (
    normalizedUserAgent.includes('safari/') &&
    !normalizedUserAgent.includes('chrome/') &&
    !normalizedUserAgent.includes('chromium/')
  ) {
    return 'Safari'
  }
  const firstToken = userAgent.trim().split(/\s+/)[0]
  if (!firstToken) return entry.peer || '—'
  const productName = firstToken.split('/')[0]
  return productName || entry.peer || '—'
}
