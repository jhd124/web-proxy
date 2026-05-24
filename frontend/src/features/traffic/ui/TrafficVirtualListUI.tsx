import { useVirtualizer } from '@tanstack/react-virtual'
import { useLayoutEffect, useMemo, useRef, type ReactElement } from 'react'
import type { TrafficEntry } from '../../../types'
import { trafficTexts as t } from '../texts'
import {
  getTrafficSchemeLabel,
  getTrafficSummary,
} from '../trafficDisplay'
import s from './TrafficVirtualListUI.module.css'

const ROW_HEIGHT_PX = 40
const TOP_STABLE_THRESHOLD_PX = 8

export type TrafficVirtualListTagTexts = {
  tagError: string
  tagBypassed: string
  tagPending: string
}

export type TrafficVirtualListUIProps = {
  entries: TrafficEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  onEntryDoubleClick?: (id: string) => void
  emptyText?: string
  className?: string
  tagTexts?: TrafficVirtualListTagTexts
}

export function TrafficVirtualListUI({
  entries,
  selectedId,
  onSelect,
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

  const virtualizer = useVirtualizer({
    count: displayEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    overscan: 16,
  })

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

  return (
    <div
      ref={parentRef}
      className={scrollerClass}
      onScroll={(event) => {
        previousScrollTopRef.current = event.currentTarget.scrollTop
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

          const summary = getTrafficSummary(entry)
          const hasOverrideMatch = Boolean(entry.overrideMatchId)
          const hasBreakpointMatch = Boolean(entry.breakpointMatchId)
          const matchState = hasOverrideMatch
            ? hasBreakpointMatch
              ? 'both'
              : 'override'
            : hasBreakpointMatch
              ? 'breakpoint'
              : null

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
              }}
            >
              <button
                type="button"
                className={`${s.row} ${selectedId === entry.id ? s.rowActive : ''}`}
                style={{ height: virtualRow.size }}
                onClick={() => onSelect(entry.id)}
                onDoubleClick={
                  onEntryDoubleClick
                    ? () => onEntryDoubleClick(entry.id)
                    : undefined
                }
              >
                {matchState && (
                  <span
                    className={`${s.matchDot} ${
                      matchState === 'both'
                        ? s.matchDotBoth
                        : matchState === 'breakpoint'
                          ? s.matchDotBreakpoint
                          : s.matchDotOverride
                    }`}
                    aria-label={matchState}
                    title={matchState}
                  />
                )}
                <span className={s.scheme}>{getTrafficSchemeLabel(entry)}</span>
                <span className={s.method}>{entry.method}</span>
                <span className={s.url} title={summary}>
                  {summary}
                </span>
                {entry.error && (
                  <span className={`${s.tag} ${s.tagErr}`}>{tags.tagError}</span>
                )}
                {entry.mitmBypassed && (
                  <span className={`${s.tag} ${s.tagWarn}`}>{tags.tagBypassed}</span>
                )}
                {entry.pending && (
                  <span className={`${s.tag} ${s.tagWarn}`}>{tags.tagPending}</span>
                )}
                {entry.responseStatus != null && (
                  <span className={s.status}>{entry.responseStatus}</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
