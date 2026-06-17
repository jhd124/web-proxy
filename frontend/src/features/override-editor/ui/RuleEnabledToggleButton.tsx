import type { ReactElement } from 'react'
import { cn } from '@/lib/utils'
import { panelHeaderStyles as ph } from '@/components/panel-header'
import { TooltipButton } from './TooltipButton'
import s from './RuleEnabledToggleButton.module.css'

type RuleEnabledToggleButtonProps = {
  enabled: boolean
  isSaving: boolean
  enableLabel: string
  disableLabel: string
  savingLabel: string
  onToggle: (nextEnabled: boolean) => void
}

export function RuleEnabledToggleButton({
  enabled,
  isSaving,
  enableLabel,
  disableLabel,
  savingLabel,
  onToggle,
}: RuleEnabledToggleButtonProps): ReactElement {
  const actionLabel = enabled ? disableLabel : enableLabel

  return (
    <TooltipButton
      type="button"
      className={`ghost ${ph.iconBtn}`}
      disabled={isSaving}
      aria-label={actionLabel}
      tooltip={isSaving ? savingLabel : actionLabel}
      onClick={() => onToggle(!enabled)}
    >
      <span
        className={cn(
          s.stateDot,
          enabled ? s.stateDotDisabled : s.stateDotEnabled,
          isSaving && s.stateDotSaving,
        )}
        aria-hidden
      />
    </TooltipButton>
  )
}
