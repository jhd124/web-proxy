import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import s from './FloatingActionButton.module.css'

type FloatingActionButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode
  visible?: boolean
}

export function FloatingActionButton({
  icon,
  visible = true,
  className,
  ...buttonProps
}: FloatingActionButtonProps): ReactElement {
  return (
    <button
      type="button"
      {...buttonProps}
      className={cn(s.button, visible && s.buttonVisible, className)}
    >
      <span className={s.icon}>{icon}</span>
    </button>
  )
}
