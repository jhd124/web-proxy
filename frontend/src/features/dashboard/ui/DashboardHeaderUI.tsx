import { useCallback, useState } from 'react'
import {
  Bookmark,
  CirclePause,
  CirclePlay,
  KeyRound,
  Pin,
  Replace,
  Signpost,
} from 'lucide-react'
import { dashboardTexts } from '../texts'
import s from './DashboardHeaderUI.module.css'
import { Button } from '@/components/ui/button'
import { SimpleTooltip } from '@/components/ui/tooltip'
import { downloadFromUrl } from '@/lib/download'

type Props = {
  proxyListenAddress: string | null
  capturePaused: boolean
  captureToggleSaving: boolean
  activeOverridesCount: number
  activeBreakpointsCount: number
  onCaptureToggleClick: () => void
  onBreakpointsEntryClick: () => void
  onOverridesEntryClick: () => void
  onSavedRequestsEntryClick: () => void
  onFloatingTrafficEntryClick: () => void
}

function HeaderEntryTooltipLabel({
  primary,
  warning,
}: {
  primary: string
  warning?: string
}) {
  if (!warning) {
    return primary
  }
  return (
    <span className={s.tooltipStack}>
      <span>{primary}</span>
      <span className={s.tooltipWarn}>{warning}</span>
    </span>
  )
}

export function DashboardHeaderUI({
  proxyListenAddress,
  capturePaused,
  captureToggleSaving,
  activeOverridesCount,
  activeBreakpointsCount,
  onCaptureToggleClick,
  onBreakpointsEntryClick,
  onOverridesEntryClick,
  onSavedRequestsEntryClick,
  onFloatingTrafficEntryClick,
}: Props) {
  const t = dashboardTexts.header
  const mitm = dashboardTexts.mitm
  const [downloading, setDownloading] = useState(false)
  const hasActiveOverrides = activeOverridesCount > 0
  const hasActiveBreakpoints = activeBreakpointsCount > 0

  const downloadMitmCa = useCallback(async () => {
    setDownloading(true)
    try {
      await downloadFromUrl(mitm.linkPath, mitm.linkDownload)
    } catch (e) {
      window.alert(
        t.downloadCaFailed(e instanceof Error ? e.message : String(e)),
      )
    } finally {
      setDownloading(false)
    }
  }, [mitm.linkPath, mitm.linkDownload, t])

  return (
    <header className={s.top}>
      <div className={s.meta}>
        {proxyListenAddress != null && (
          <span
            className={s.listenAddr}
            aria-label={t.proxyListenAriaLabel(proxyListenAddress)}
          >
            <span className={s.listenAddrPrefix}>{t.proxyListenPrefix}</span>{' '}
            <span className={s.listenAddrHost}>{proxyListenAddress}</span>
          </span>
        )}

        <SimpleTooltip label={t.downloadCaTooltip}>
          <Button
            type="button"
            variant="ghost"
            aria-label={t.downloadCaAriaLabel}
            disabled={downloading}
            onClick={() => void downloadMitmCa()}
          >
            <KeyRound />
          </Button>
        </SimpleTooltip>

        <SimpleTooltip
          label={
            capturePaused ? t.resumeCaptureTooltip : t.pauseCaptureTooltip
          }
        >
          <Button
            type="button"
            variant="ghost"
            aria-label={
              capturePaused ? t.resumeCaptureAriaLabel : t.pauseCaptureAriaLabel
            }
            disabled={captureToggleSaving}
            onClick={onCaptureToggleClick}
          >
            {capturePaused ? <CirclePlay /> : <CirclePause />}
          </Button>
        </SimpleTooltip>

        <SimpleTooltip
          label={
            <HeaderEntryTooltipLabel
              primary={t.openOverridesTooltip}
              warning={
                hasActiveOverrides
                  ? t.activeOverridesWarning(activeOverridesCount)
                  : undefined
              }
            />
          }
        >
          <span className={s.entryBadgeWrap}>
            <Button
              type="button"
              variant="ghost"
              aria-label={
                hasActiveOverrides
                  ? `${t.openOverridesAriaLabel}. ${t.activeOverridesWarning(activeOverridesCount)}`
                  : t.openOverridesAriaLabel
              }
              onClick={onOverridesEntryClick}
            >
              <Replace />
            </Button>
            {hasActiveOverrides && (
              <span className={s.badgeDot} aria-hidden />
            )}
          </span>
        </SimpleTooltip>

        <SimpleTooltip label={t.openSavedRequestsTooltip}>
          <Button
            type="button"
            variant="ghost"
            aria-label={t.openSavedRequestsAriaLabel}
            onClick={onSavedRequestsEntryClick}
          >
            <Bookmark />
          </Button>
        </SimpleTooltip>

        <SimpleTooltip label={t.openFloatingTrafficTooltip}>
          <Button
            type="button"
            variant="ghost"
            aria-label={t.openFloatingTrafficAriaLabel}
            onClick={onFloatingTrafficEntryClick}
          >
            <Pin />
          </Button>
        </SimpleTooltip>

        <SimpleTooltip
          label={
            <HeaderEntryTooltipLabel
              primary={t.openBreakpointsTooltip}
              warning={
                hasActiveBreakpoints
                  ? t.activeBreakpointsWarning(activeBreakpointsCount)
                  : undefined
              }
            />
          }
        >
          <span className={s.entryBadgeWrap}>
            <Button
              type="button"
              variant="ghost"
              aria-label={
                hasActiveBreakpoints
                  ? `${t.openBreakpointsAriaLabel}. ${t.activeBreakpointsWarning(activeBreakpointsCount)}`
                  : t.openBreakpointsAriaLabel
              }
              onClick={onBreakpointsEntryClick}
            >
              <Signpost />
            </Button>
            {hasActiveBreakpoints && (
              <span className={s.badgeDot} aria-hidden />
            )}
          </span>
        </SimpleTooltip>
      </div>
    </header>
  )
}
