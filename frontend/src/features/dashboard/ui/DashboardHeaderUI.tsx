import { useCallback, useState } from 'react'
import {
  CirclePause,
  CirclePlay,
  KeyRound,
  Pin,
  WifiCog,
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
  wifiProxySaving: boolean
  onCaptureToggleClick: () => void
  onEnableWifiProxyClick: () => void
  onFloatingTrafficEntryClick: () => void
}

export function DashboardHeaderUI({
  proxyListenAddress,
  capturePaused,
  captureToggleSaving,
  wifiProxySaving,
  onCaptureToggleClick,
  onEnableWifiProxyClick,
  onFloatingTrafficEntryClick,
}: Props) {
  const t = dashboardTexts.header
  const mitm = dashboardTexts.mitm
  const [downloading, setDownloading] = useState(false)

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
            {capturePaused ? <CirclePlay  /> : <CirclePause />}
          </Button>
        </SimpleTooltip>

        <SimpleTooltip label={t.enableWifiProxyTooltip}>
          <Button
            type="button"
            variant="ghost"
            aria-label={t.enableWifiProxyAriaLabel}
            disabled={wifiProxySaving}
            onClick={onEnableWifiProxyClick}
          >
            <WifiCog />
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
      </div>
    </header>
  )
}
