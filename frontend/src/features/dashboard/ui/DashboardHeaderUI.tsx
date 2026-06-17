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
import { TooltipButton } from '../../override-editor/ui/TooltipButton'
import { panelHeaderStyles as ph } from '@/components/panel-header'
import s from './DashboardHeaderUI.module.css'
import { Input } from '@/components/ui/input'
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
  availableRequesterApps: string[]
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
  availableRequesterApps,
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
  const listenAddressLabel =
    typeof proxyListenAddress === 'string' && proxyListenAddress.trim().length > 0
      ? proxyListenAddress
      : t.missingProxyAddress
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
          <TooltipButton
            type="button"
            className={`ghost ${ph.iconBtn}`}
            tooltip={trafficTexts.clear}
            aria-label={trafficTexts.clear}
            onClick={clearTraffic}
          >
            <Trash size={16} aria-hidden />
          </TooltipButton>
          <span className={s.entryBadgeWrap}>
            <TooltipButton
              type="button"
              className={`ghost ${ph.iconBtn}`}
              tooltip={trafficTexts.filter.buttonTooltip}
              aria-label={trafficTexts.filter.buttonAriaLabel}
              aria-pressed={hasTrafficFilters}
              onClick={() => setFilterDialogOpen(true)}
            >
              <ListFilter size={16} aria-hidden />
            </TooltipButton>
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
        requesterAppOptions={availableRequesterApps}
        toggleFilterValue={toggleTrafficFilterValue}
        clearFilters={clearTrafficFilters}
      />
      <div className={s.right}>
        <span
          className={s.listenAddr}
          aria-label={t.proxyListenAriaLabel(listenAddressLabel)}
        >
          <span className={s.listenAddrPrefix}>{t.proxyListenPrefix}</span>{' '}
          <span className={s.listenAddrHost}>{listenAddressLabel}</span>
        </span>

        <TooltipButton
          type="button"
          className={`ghost ${ph.iconBtn}`}
          tooltip={t.downloadCaTooltip}
          aria-label={t.downloadCaAriaLabel}
          disabled={downloading}
          onClick={() => void downloadMitmCa()}
        >
          <KeyRound size={16} aria-hidden />
        </TooltipButton>

        <TooltipButton
          type="button"
          className={`ghost ${ph.iconBtn}`}
          tooltip={capturePaused ? t.resumeCaptureTooltip : t.pauseCaptureTooltip}
          aria-label={capturePaused ? t.resumeCaptureAriaLabel : t.pauseCaptureAriaLabel}
          disabled={captureToggleSaving}
          onClick={onCaptureToggleClick}
        >
          {capturePaused ? <CirclePlay size={16} aria-hidden /> : <CirclePause size={16} aria-hidden />}
        </TooltipButton>

        <TooltipButton
          type="button"
          className={`ghost ${ph.iconBtn}`}
          tooltip={t.enableWifiProxyTooltip}
          aria-label={t.enableWifiProxyAriaLabel}
          disabled={wifiProxySaving}
          onClick={onEnableWifiProxyClick}
        >
          <WifiCog size={16} aria-hidden />
        </TooltipButton>

        <TooltipButton
          type="button"
          className={`ghost ${ph.iconBtn}`}
          tooltip={t.exportHarTooltip}
          aria-label={t.exportHarAriaLabel}
          disabled={exportHarSaving}
          onClick={onExportHarClick}
        >
          <Download size={16} aria-hidden />
        </TooltipButton>

        <TooltipButton
          type="button"
          className={`ghost ${ph.iconBtn}`}
          tooltip={t.openFloatingTrafficTooltip}
          aria-label={t.openFloatingTrafficAriaLabel}
          onClick={onFloatingTrafficEntryClick}
        >
          <Pin size={16} aria-hidden />
        </TooltipButton>
      </div>
    </header>
  )
}
