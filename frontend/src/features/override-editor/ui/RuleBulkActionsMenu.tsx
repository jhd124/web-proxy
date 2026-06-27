import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import { Ellipsis } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { panelHeaderStyles as ph } from '@/components/panel-header'
import s from './RuleBulkActionsMenu.module.css'

const CLOSE_DELAY_MS = 120

type RuleWithEnabled = {
  id: string
  enabled: boolean
}

type RuleBulkActionsLabels = {
  menu: string
  enableAll: string
  disableAll: string
  saving: string
}

type RuleBulkActionsMenuProps<T extends RuleWithEnabled> = {
  rules: T[]
  toggleSaving: Record<string, boolean>
  labels: RuleBulkActionsLabels
  setRuleEnabled: (rule: T, enabled: boolean) => Promise<void> | void
}

export function RuleBulkActionsMenu<T extends RuleWithEnabled>({
  rules,
  toggleSaving,
  labels,
  setRuleEnabled,
}: RuleBulkActionsMenuProps<T>): ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const enableTargetRules = useMemo(
    () => rules.filter((rule) => !rule.enabled),
    [rules],
  )
  const disableTargetRules = useMemo(
    () => rules.filter((rule) => rule.enabled),
    [rules],
  )
  const isEnabling = enableTargetRules.some((rule) => toggleSaving[rule.id] === true)
  const isDisabling = disableTargetRules.some((rule) => toggleSaving[rule.id] === true)
  const isEnableDisabled = rules.length === 0 || enableTargetRules.length === 0 || isEnabling
  const isDisableDisabled =
    rules.length === 0 || disableTargetRules.length === 0 || isDisabling

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current === null) return
    window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = null
  }, [])

  const openMenu = useCallback(() => {
    clearCloseTimer()
    setIsOpen(true)
  }, [clearCloseTimer])

  const scheduleClose = useCallback(() => {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      setIsOpen(false)
      closeTimerRef.current = null
    }, CLOSE_DELAY_MS)
  }, [clearCloseTimer])

  useEffect(() => {
    return () => {
      clearCloseTimer()
    }
  }, [clearCloseTimer])

  const handleEnableAll = () => {
    if (isEnableDisabled) return
    setIsOpen(false)
    void Promise.all(
      enableTargetRules.map((rule) => Promise.resolve(setRuleEnabled(rule, true))),
    )
  }
  const handleDisableAll = () => {
    if (isDisableDisabled) return
    setIsOpen(false)
    void Promise.all(
      disableTargetRules.map((rule) => Promise.resolve(setRuleEnabled(rule, false))),
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <span
        className="inline-flex"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        onFocus={openMenu}
        onBlur={scheduleClose}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`ghost ${ph.iconBtn} inline-flex`}
            aria-label={labels.menu}
          >
            <Ellipsis size={16} aria-hidden />
          </button>
        </PopoverTrigger>
      </span>
      <PopoverContent
        align="end"
        onMouseEnter={openMenu}
        onMouseLeave={scheduleClose}
        onFocus={openMenu}
        onBlur={scheduleClose}
        role="menu"
      >
        <button
          type="button"
          className={s.menuItem}
          disabled={isEnableDisabled}
          role="menuitem"
          onClick={handleEnableAll}
        >
          <span
            className={cn(
              s.stateDot,
              s.stateDotEnabled,
            )}
            aria-hidden
          />
          <span>{isEnabling ? labels.saving : labels.enableAll}</span>
        </button>
        <button
          type="button"
          className={s.menuItem}
          disabled={isDisableDisabled}
          role="menuitem"
          onClick={handleDisableAll}
        >
          <span className={cn(s.stateDot, s.stateDotDisabled)} aria-hidden />
          <span>{isDisabling ? labels.saving : labels.disableAll}</span>
        </button>
      </PopoverContent>
    </Popover>
  )
}
