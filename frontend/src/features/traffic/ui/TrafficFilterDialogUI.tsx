import { Dialog } from 'radix-ui'
import { trafficTexts } from '../texts'
import {
  METHOD_VALUES,
  RESOURCE_TYPE_VALUES,
  STATUS_CLASS_VALUES,
  type TrafficFilterGroupKey,
  type TrafficFilters,
} from '../trafficFilter'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import s from './TrafficFilterDialogUI.module.css'

type FilterGroup = {
  key: TrafficFilterGroupKey
  title: string
  options: readonly string[]
  labels: Record<string, string>
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  filters: TrafficFilters
  requesterAppOptions: string[]
  toggleFilterValue: (group: TrafficFilterGroupKey, value: string) => void
  clearFilters: () => void
}

export function TrafficFilterDialogUI({
  open,
  onOpenChange,
  filters,
  requesterAppOptions,
  toggleFilterValue,
  clearFilters,
}: Props) {
  const t = trafficTexts.filter
  const groups: FilterGroup[] = [
    {
      key: 'resourceTypes',
      title: t.groupResourceType,
      options: RESOURCE_TYPE_VALUES,
      labels: t.resourceTypeLabels,
    },
    {
      key: 'methods',
      title: t.groupMethod,
      options: METHOD_VALUES,
      labels: t.methodLabels,
    },
    {
      key: 'statusClasses',
      title: t.groupStatus,
      options: STATUS_CLASS_VALUES,
      labels: t.statusClassLabels,
    },
    {
      key: 'requesterApps',
      title: t.groupRequesterApp,
      options: requesterAppOptions,
      labels: t.requesterAppLabels,
    },
  ]

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={s.overlay} />
        <Dialog.Content className={s.content}>
          <div className={s.header}>
            <div className={s.titleWrap}>
              <Dialog.Title className={s.title}>{t.dialogTitle}</Dialog.Title>
              <Dialog.Description className={s.description}>
                {t.dialogDescription}
              </Dialog.Description>
            </div>
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              {t.clearAll}
            </Button>
          </div>

          <div className={s.groups}>
            {groups.map((group) => (
              <div key={group.key} className={s.group}>
                <span className={s.groupTitle}>{group.title}</span>
                <div className={s.tagList}>
                  {group.options.map((value) => {
                    const isSelected = filters[group.key].includes(value)
                    return (
                      <button
                        key={value}
                        type="button"
                        role="checkbox"
                        aria-checked={isSelected}
                        className={cn(s.tag, isSelected && s.tagActive)}
                        onClick={() => toggleFilterValue(group.key, value)}
                      >
                        {group.labels[value] ?? value}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className={s.footer}>
            <Dialog.Close asChild>
              <Button type="button" variant="outline" size="sm">
                {t.close}
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
