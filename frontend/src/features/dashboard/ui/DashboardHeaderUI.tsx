import { useCallback, useState } from 'react'
import {
  CirclePause,
  CirclePlay,
  Download,
  KeyRound,
  Pin,
  Trash,
  WifiCog,
} from 'lucide-react'
import { dashboardTexts } from '../texts'
import { trafficTexts } from '../../traffic/texts'
import s from './DashboardHeaderUI.module.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SimpleTooltip } from '@/components/ui/tooltip'
import { downloadFromUrl } from '@/lib/download'
import { cn } from '@/lib/utils'

type Props = {
  urlFilter: string
  setUrlFilter: (value: string) => void
  clearTraffic: () => void
  proxyListenAddress: string | null
  capturePaused: boolean
  captureToggleSaving: boolean
  wifiProxySaving: boolean
  exportHarSaving: boolean
  onCaptureToggleClick: () => void
  onEnableWifiProxyClick: () => void
  onFloatingTrafficEntryClick: () => void
  onExportHarClick: () => void
}

export function DashboardHeaderUI({
  urlFilter,
  setUrlFilter,
  clearTraffic,
  proxyListenAddress,
  capturePaused,
  captureToggleSaving,
  wifiProxySaving,
  exportHarSaving,
  onCaptureToggleClick,
  onEnableWifiProxyClick,
  onFloatingTrafficEntryClick,
  onExportHarClick,
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

  const handleSubmit = useCallback((e: React.FormEvent<HTMLFormElement>) => {
    console.log('handleSubmit', e)
    e.preventDefault()
  }, [])

  return (
    <header className={s.top}>
      <div className={s.left}>
        <form onSubmit={handleSubmit} className={cn("flex items-center gap-1", s.form)}>
          <Input
            type="search"
            value={urlFilter}
            onChange={(e) => setUrlFilter(e.target.value)}
            placeholder={trafficTexts.filterPlaceholder}
            autoComplete="off"
            spellCheck={false}
            className={cn("border-none active:border-none focus-visible:border-none", s.input)}
          />
          <SimpleTooltip label={trafficTexts.clear}>
            <Button type="button" variant="ghost" onClick={clearTraffic}>
              <Trash />
            </Button>
          </SimpleTooltip>
        </form>
      </div>
      <div className={s.right}>
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

        <SimpleTooltip label={t.exportHarTooltip}>
          <Button
            type="button"
            variant="ghost"
            aria-label={t.exportHarAriaLabel}
            disabled={exportHarSaving}
            onClick={onExportHarClick}
          >
            <Download />
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
