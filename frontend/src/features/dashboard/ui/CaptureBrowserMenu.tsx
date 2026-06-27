import { useState, type ReactElement } from 'react'
import { Globe } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { panelHeaderStyles as ph } from '@/components/panel-header'
import { TooltipButton } from '../../override-editor/ui/TooltipButton'
import { dashboardTexts } from '../texts'
import s from './CaptureBrowserMenu.module.css'

type CaptureBrowser = { name: string; key: string }

type Props = {
  browsers: CaptureBrowser[]
  launching: boolean
  onLaunch: (browserKey?: string) => void
}

/** 启动可抓 localhost 的 Chromium 浏览器：仅一个时直接启动，多个时弹出选择菜单。 */
export function CaptureBrowserMenu({
  browsers,
  launching,
  onLaunch,
}: Props): ReactElement | null {
  const [isOpen, setIsOpen] = useState(false)
  const t = dashboardTexts.header

  if (browsers.length === 0) return null

  if (browsers.length === 1) {
    const onlyBrowser = browsers[0]
    return (
      <TooltipButton
        type="button"
        className={`ghost ${ph.iconBtn}`}
        tooltip={t.launchCaptureBrowserWith(onlyBrowser.name)}
        aria-label={t.launchCaptureBrowserAriaLabel}
        disabled={launching}
        onClick={() => onLaunch(onlyBrowser.key)}
      >
        <Globe size={16} aria-hidden />
      </TooltipButton>
    )
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <TooltipButton
          type="button"
          className={`ghost ${ph.iconBtn}`}
          tooltip={t.launchCaptureBrowserTooltip}
          aria-label={t.captureBrowserMenuLabel}
          disabled={launching}
        >
          <Globe size={16} aria-hidden />
        </TooltipButton>
      </PopoverTrigger>
      <PopoverContent align="end" role="menu" className={s.menu}>
        {browsers.map((browser) => (
          <button
            key={browser.key}
            type="button"
            className={s.menuItem}
            role="menuitem"
            disabled={launching}
            onClick={() => {
              setIsOpen(false)
              onLaunch(browser.key)
            }}
          >
            <Globe size={14} aria-hidden />
            <span>{browser.name}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
