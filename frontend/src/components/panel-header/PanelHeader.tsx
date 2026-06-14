import type { ReactElement, ReactNode } from 'react'
import s from './PanelHeader.module.css'

type Props = {
  /** aria-labelledby 绑定的 id */
  id: string
  title: string
  subtitle?: ReactNode
  /** 右侧操作按钮区，直接传入 ReactNode（通常是 TooltipButton 图标按钮列表） */
  actions?: ReactNode
  /** 传入则在最右侧渲染关闭按钮 */
  onClose?: () => void
  closeAriaLabel?: string
}

export function PanelHeader({
  id,
  title,
  subtitle,
  actions,
  onClose,
  closeAriaLabel = 'Close',
}: Props): ReactElement {
  return (
    <div className={s.head}>
      <div className={s.titleBlock}>
        <h2 id={id}>{title}</h2>
        {subtitle && <p className={`small muted ${s.subtitle}`}>{subtitle}</p>}
      </div>
      {(actions || onClose) && (
        <div className={s.right}>
          {actions && <div className={s.actions}>{actions}</div>}
          {onClose && (
            <button
              type="button"
              className={`ghost ${s.closeBtn}`}
              onClick={onClose}
              aria-label={closeAriaLabel}
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  )
}
