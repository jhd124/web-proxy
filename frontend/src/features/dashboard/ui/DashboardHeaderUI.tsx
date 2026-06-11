import { useCallback, useState } from 'react'
import {
  CirclePause,
  CirclePlay,
  Download,
  KeyRound,
  ListFilter,
  Pin,
  Trash,
  WifiCog,
  X,
} from 'lucide-react'
import { dashboardTexts } from '../texts'
import { trafficTexts } from '../../traffic/texts'
import { TrafficFilterDialogUI } from '../../traffic/ui/TrafficFilterDialogUI'
import type {
  TrafficFilterGroupKey,
  TrafficFilters,
} from '../../traffic/trafficFilter'
import s from './DashboardHeaderUI.module.css'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SimpleTooltip } from '@/components/ui/tooltip'
import { downloadFromUrl } from '@/lib/download'
import { cn } from '@/lib/utils'

type Props = {
  urlFilter: string
  setUrlFilter: (value: string) => void
  urlFilterTags: string[]
  commitUrlFilterInputAsTag: () => void
  removeUrlFilterTag: (keyword: string) => void
  popUrlFilterTag: () => void
  clearTraffic: () => void
  trafficFilters: TrafficFilters
  toggleTrafficFilterValue: (group: TrafficFilterGroupKey, value: string) => void
  clearTrafficFilters: () => void
  hasTrafficFilters: boolean
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
  urlFilterTags,
  commitUrlFilterInputAsTag,
  removeUrlFilterTag,
  popUrlFilterTag,
  clearTraffic,
  trafficFilters,
  toggleTrafficFilterValue,
  clearTrafficFilters,
  hasTrafficFilters,
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
  const [filterDialogOpen, setFilterDialogOpen] = useState(false)

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
    e.preventDefault()
    commitUrlFilterInputAsTag()
  }, [commitUrlFilterInputAsTag])

  return (
    <header className={s.top}>
      <div className={s.left}>
        <form
          onSubmit={handleSubmit}
          className={cn('flex items-center gap-1', s.form)}
        >
          <div className={s.filterBox}>
            {urlFilterTags.map((keyword) => (
              <button
                key={keyword}
                type="button"
                className={s.filterTag}
                onClick={() => removeUrlFilterTag(keyword)}
                aria-label={trafficTexts.removeKeywordAriaLabel(keyword)}
              >
                <span className={s.filterTagLabel}>{keyword}</span>
                <X className={s.filterTagCloseIcon} />
              </button>
            ))}
            <Input
              type="search"
              value={urlFilter}
              onChange={(e) => setUrlFilter(e.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  commitUrlFilterInputAsTag()
                  return
                }
                if (event.key !== 'Backspace') return
                if (urlFilter.trim().length > 0) return
                if (urlFilterTags.length === 0) return
                event.preventDefault()
                popUrlFilterTag()
              }}
              placeholder={trafficTexts.filterPlaceholder}
              autoComplete="off"
              spellCheck={false}
              className={cn(
                'border-none active:border-none focus-visible:border-none',
                s.input,
              )}
            />
          </div>
          <SimpleTooltip label={trafficTexts.clear}>
            <Button type="button" variant="ghost" onClick={clearTraffic}>
              <Trash />
            </Button>
          </SimpleTooltip>
          <span className={s.entryBadgeWrap}>
            <SimpleTooltip label={trafficTexts.filter.buttonTooltip}>
              <Button
                type="button"
                variant="ghost"
                aria-label={trafficTexts.filter.buttonAriaLabel}
                aria-pressed={hasTrafficFilters}
                onClick={() => setFilterDialogOpen(true)}
              >
                <ListFilter />
              </Button>
            </SimpleTooltip>
            {hasTrafficFilters && (
              <span
                className={s.badgeDot}
                aria-label={trafficTexts.filter.activeBadgeAriaLabel}
              />
            )}
          </span>
        </form>
      </div>
      <TrafficFilterDialogUI
        open={filterDialogOpen}
        onOpenChange={setFilterDialogOpen}
        filters={trafficFilters}
        toggleFilterValue={toggleTrafficFilterValue}
        clearFilters={clearTrafficFilters}
      />
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
            {capturePaused ? <CirclePlay /> : <CirclePause />}
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
