import * as React from 'react'
import { Tooltip } from 'radix-ui'

import { cn } from '@/lib/utils'

const defaultContentClass =
  'z-50 max-w-xs rounded-md border border-border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md'

export function TooltipProvider({
  delayDuration = 400,
  ...props
}: React.ComponentProps<typeof Tooltip.Provider>) {
  return <Tooltip.Provider delayDuration={delayDuration} {...props} />
}

export function TooltipRoot(props: React.ComponentProps<typeof Tooltip.Root>) {
  return <Tooltip.Root data-slot="tooltip" {...props} />
}

export function TooltipTrigger(
  props: React.ComponentProps<typeof Tooltip.Trigger>,
) {
  return <Tooltip.Trigger data-slot="tooltip-trigger" {...props} />
}

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof Tooltip.Content>) {
  return (
    <Tooltip.Portal>
      <Tooltip.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(defaultContentClass, className)}
        {...props}
      />
    </Tooltip.Portal>
  )
}

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
    <TooltipProvider delayDuration={delayDuration}>
      <TooltipRoot {...controlled}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent sideOffset={sideOffset} className={contentClassName}>
          {label}
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  )
}

export {
  TooltipRoot as Tooltip,
}
