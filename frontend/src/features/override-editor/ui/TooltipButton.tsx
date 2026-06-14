import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { SimpleTooltip } from '@/components/ui/tooltip'

type TooltipButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tooltip: ReactNode
}

export function TooltipButton({
  tooltip,
  className,
  children,
  ...buttonProps
}: TooltipButtonProps): ReactElement {
  const mergedClassName = [className, 'inline-flex'].filter(Boolean).join(' ')
  const buttonNode = (
    <button {...buttonProps} className={mergedClassName}>
      {children}
    </button>
  )

  if (buttonProps.disabled) {
    return (
      <SimpleTooltip label={tooltip}>
        <span className="inline-flex">{buttonNode}</span>
      </SimpleTooltip>
    )
  }

  return <SimpleTooltip label={tooltip}>{buttonNode}</SimpleTooltip>
}
