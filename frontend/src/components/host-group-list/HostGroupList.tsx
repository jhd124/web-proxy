import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import s from './HostGroupList.module.css'

export type HostGroup<TItem> = {
  host: string
  items: TItem[]
}

type HostGroupListProps<TItem> = {
  groups: HostGroup<TItem>[]
  getItemKey: (item: TItem) => string
  renderItem: (item: TItem) => ReactNode
  isGroupActive?: (group: HostGroup<TItem>) => boolean
  isGroupAlert?: (group: HostGroup<TItem>) => boolean
  toggleLabel?: (host: string) => string
  idPrefix?: string
}

export function HostGroupList<TItem>({
  groups,
  getItemKey,
  renderItem,
  isGroupActive,
  isGroupAlert,
  toggleLabel,
  idPrefix = 'host-group',
}: HostGroupListProps<TItem>) {
  return (
    <div className={s.originGroupList}>
      {groups.map((group) => {
        const hostId = `${idPrefix}-${String(group.host).replace(/\s+/g, '_')}`
        const contentId = `${hostId}-items`
        const isActive = isGroupActive?.(group) ?? false
        const isAlert = isGroupAlert?.(group) ?? false
        return (
          <section
            key={group.host}
            className={s.originSection}
            aria-label={group.host}
          >
            <Collapsible defaultOpen className={s.originCollapsible}>
              <h3 className={s.originHeading} id={hostId}>
                <CollapsibleTrigger
                  className={s.originTrigger}
                  type="button"
                  aria-label={toggleLabel ? toggleLabel(group.host) : group.host}
                  aria-controls={contentId}
                >
                  <ChevronDown
                    className={`${s.originChevron} ${
                      isAlert
                        ? s.originChevronAlert
                        : isActive
                          ? s.originChevronActive
                          : ''
                    }`}
                    data-icon="inline-start"
                    aria-hidden
                  />
                  <span className={`mono ${s.originHostLabel}`}>
                    {group.host}
                  </span>
                  <span
                    className={`small muted ${s.originRuleCount}`}
                    aria-hidden
                  >
                    ({group.items.length})
                  </span>
                </CollapsibleTrigger>
              </h3>
              <CollapsibleContent
                id={contentId}
                className={s.originCollapsibleContent}
                role="region"
                aria-labelledby={hostId}
              >
                <div className={s.originTree}>
                  <ul className={s.itemGroup}>
                    {group.items.map((item) => (
                      <li key={getItemKey(item)}>{renderItem(item)}</li>
                    ))}
                  </ul>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </section>
        )
      })}
    </div>
  )
}
