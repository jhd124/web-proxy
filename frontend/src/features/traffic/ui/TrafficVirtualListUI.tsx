import { useVirtualizer } from '@tanstack/react-virtual'
import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { ArrowUpToLine, Focus } from 'lucide-react'
import type { TrafficEntrySummary } from '../../../types'
import { trafficTexts as t } from '../texts'
import { getRequesterAppName } from '../trafficFilter'
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
  entries: TrafficEntrySummary[]
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
  const tags = useMemo<TrafficVirtualListTagTexts>(
    () =>
      tagTexts ?? {
        tagError: t.tagError,
        tagBypassed: t.tagBypassed,
        tagPending: t.tagPending,
      },
    [tagTexts],
  )
  // 列表按「最新在上」展示。为避免每次渲染都复制并反转 entries（O(n)），
  // 这里用倒序索引直接映射：展示索引 d ↔ 源索引 entryCount-1-d。
  const entryCount = entries.length
  const getEntryAtDisplayIndex = useCallback(
    (displayIndex: number) => entries[entryCount - 1 - displayIndex],
    [entries, entryCount],
  )
  const getDisplayIndexById = useCallback(
    (id: string | null) => {
      if (!id) return -1
      const sourceIndex = entries.findIndex((entry) => entry.id === id)
      return sourceIndex < 0 ? -1 : entryCount - 1 - sourceIndex
    },
    [entries, entryCount],
  )
  const parentRef = useRef<HTMLDivElement>(null)
  const previousEntriesRef = useRef<TrafficEntrySummary[]>(entries)
  const previousScrollTopRef = useRef(0)
  const previousSelectedIdRef = useRef<string | null>(null)
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
    count: entryCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 16,
  })

  useLayoutEffect(() => {
    if (!selectedId) return
    if (selectedId === previousSelectedIdRef.current) return
    const selectedDisplayIndex = getDisplayIndexById(selectedId)
    if (selectedDisplayIndex < 0) return
    virtualizer.scrollToIndex(selectedDisplayIndex, { align: 'auto' })
  }, [getDisplayIndexById, selectedId, virtualizer])

  useLayoutEffect(() => {
    previousSelectedIdRef.current = selectedId
  }, [selectedId])

  // 稳定的右键菜单回调，保证 memo 化的行不会因为内联函数而重渲染。
  const handleRowContextMenu = useCallback(
    (id: string, x: number, y: number) => {
      onSelect(id)
      setContextMenuState({ entryId: id, x, y })
    },
    [onSelect],
  )

  useLayoutEffect(() => {
    const parent = parentRef.current
    const previousEntries = previousEntriesRef.current
    if (!parent) {
      previousEntriesRef.current = entries
      return
    }

    const previousScrollTop = previousScrollTopRef.current
    const isBrowsingHistory = previousScrollTop > TOP_STABLE_THRESHOLD_PX
    if (isBrowsingHistory && previousEntries.length > 0) {
      const previousAnchorDisplayIndex = Math.floor(previousScrollTop / ROW_HEIGHT_PX)
      // 倒序展示：展示索引对应源数组的 length-1-索引。
      const previousAnchor =
        previousEntries[previousEntries.length - 1 - previousAnchorDisplayIndex]
      if (previousAnchor) {
        const nextSourceIndex = entries.findIndex(
          (entry) => entry.id === previousAnchor.id,
        )
        if (nextSourceIndex >= 0) {
          const nextAnchorDisplayIndex = entries.length - 1 - nextSourceIndex
          const anchorOffset =
            previousScrollTop - previousAnchorDisplayIndex * ROW_HEIGHT_PX
          parent.scrollTop = nextAnchorDisplayIndex * ROW_HEIGHT_PX + anchorOffset
        }
      }
    }

    previousEntriesRef.current = entries
    previousScrollTopRef.current = parent.scrollTop
  }, [entries])

  if (entryCount === 0) {
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
      : entries.find((entry) => entry.id === activeContextEntryId) ?? null
  const selectedDisplayIndex = getDisplayIndexById(selectedId)
  const canFocusSelectedEntry = selectedDisplayIndex >= 0

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
              if (entryCount === 0) return

              const currentDisplayIndex = getDisplayIndexById(selectedId)
              if (currentDisplayIndex < 0) {
                const firstEntry = getEntryAtDisplayIndex(0)
                if (firstEntry) onSelect(firstEntry.id)
                return
              }

              const nextDisplayIndex =
                event.key === 'ArrowUp'
                  ? Math.max(currentDisplayIndex - 1, 0)
                  : Math.min(currentDisplayIndex + 1, entryCount - 1)
              if (nextDisplayIndex === currentDisplayIndex) return
              const nextEntry = getEntryAtDisplayIndex(nextDisplayIndex)
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
                const entry = getEntryAtDisplayIndex(virtualRow.index)
                if (!entry) return null
                const hasMatchedRule = Boolean(
                  entry.overrideMatchId ||
                    entry.breakpointMatchId ||
                    matchedEntryIds?.has(entry.id),
                )

                return (
                  <TrafficRow
                    key={entry.id}
                    entry={entry}
                    isSelected={selectedId === entry.id}
                    hasMatchedRule={hasMatchedRule}
                    tags={tags}
                    top={virtualRow.start}
                    height={virtualRow.size}
                    onSelect={onSelect}
                    onContextMenu={handleRowContextMenu}
                    onEntryDoubleClick={onEntryDoubleClick}
                  />
                )
              })}
            </ul>
          </div>
          <div className={s.actionGroup}>
            {showBackToTop ? (
              <button
                type="button"
                className={`${s.floatingAction} ${s.floatingActionVisible}`}
                onClick={() => {
                  parentRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                aria-label={t.backToTop}
                title={t.backToTop}
              >
                <ArrowUpToLine className={s.floatingActionIcon} aria-hidden />
              </button>
            ) : null}
            {canFocusSelectedEntry ? (
              <button
                type="button"
                className={`${s.floatingAction} ${s.floatingActionVisible}`}
                onClick={() => {
                  virtualizer.scrollToIndex(selectedDisplayIndex, { align: 'auto' })
                }}
                aria-label={t.focusSelected}
                title={t.focusSelected}
              >
                <Focus className={s.floatingActionIcon} aria-hidden />
              </button>
            ) : null}
          </div>
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

type TrafficRowProps = {
  entry: TrafficEntrySummary
  isSelected: boolean
  hasMatchedRule: boolean
  tags: TrafficVirtualListTagTexts
  top: number
  height: number
  onSelect: (id: string) => void
  onContextMenu: (id: string, x: number, y: number) => void
  onEntryDoubleClick?: (id: string) => void
}

// memo 化的单行：仅当自身 props（entry / 选中态 / 命中态等）变化时才重渲染，
// 派生值（content-type、appName 等 header 查找）也只在这些情况下重算。
const TrafficRow = memo(function TrafficRow({
  entry,
  isSelected,
  hasMatchedRule,
  tags,
  top,
  height,
  onSelect,
  onContextMenu,
  onEntryDoubleClick,
}: TrafficRowProps): ReactElement {
  const httpCodeText = entry.responseStatus != null ? String(entry.responseStatus) : '—'
  const contentType = getEntryContentType(entry)
  const appName = getRequesterAppName(entry)
  const rowStatusLabel = getRowStatusLabel(entry, tags)

  return (
    <li
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height,
        transform: `translateY(${top}px)`,
        outline: 'none',
        outlineWidth: 0,
      }}
    >
      <button
        type="button"
        className={`${s.row} ${isSelected ? s.rowActive : ''} ${hasMatchedRule ? s.rowMatched : ''}`}
        style={{ height }}
        onClick={() => {
          onSelect(entry.id)
        }}
        onContextMenu={(event) => {
          onContextMenu(entry.id, event.clientX, event.clientY)
        }}
        onDoubleClick={
          onEntryDoubleClick ? () => onEntryDoubleClick(entry.id) : undefined
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
})

function getEntryContentType(entry: TrafficEntrySummary): string {
  const responseContentType = entry.responseContentType
  if (responseContentType) return normalizeContentTypeLabel(responseContentType)
  const requestContentType = entry.requestContentType
  if (requestContentType) return normalizeContentTypeLabel(requestContentType)
  return '—'
}

function getRowStatusLabel(entry: TrafficEntrySummary, tags: TrafficVirtualListTagTexts): string {
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

