import * as React from 'react'
import { Tooltip } from 'radix-ui'

import { cn } from '@/lib/utils'

const defaultContentClass =
  'z-50 max-w-xs rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md'

type BaseTooltipProps = {
  /** 提示文案 */
  label: React.ReactNode
  /** 单个可 ref 的子元素（与 Trigger asChild 对齐） */
  children: React.ReactElement
  /** Provider 延迟，默认 400ms */
  delayDuration?: number
  /** 与触发器的间距，默认 6 */
  sideOffset?: number
  /** 追加到内容容器的 className */
  contentClassName?: string
}

type UncontrolledSimpleTooltipProps = BaseTooltipProps & {
  open?: undefined
  onOpenChange?: undefined
}

type ControlledSimpleTooltipProps = BaseTooltipProps & {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export type SimpleTooltipProps =
  | UncontrolledSimpleTooltipProps
  | ControlledSimpleTooltipProps

/** 封装 Radix Tooltip：Provider + Root + Trigger + Content，统一样式 */
export function SimpleTooltip({
  label,
  children,
  delayDuration = 400,
  sideOffset = 6,
  contentClassName,
  open,
  onOpenChange,
}: SimpleTooltipProps) {
  const controlled =
    open !== undefined && onOpenChange !== undefined
      ? { open, onOpenChange }
      : {}

  return (
    <Tooltip.Provider delayDuration={delayDuration}>
      <Tooltip.Root {...controlled}>
        <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={sideOffset}
            className={cn(defaultContentClass, contentClassName)}
          >
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}
