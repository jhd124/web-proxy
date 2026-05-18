import { useCallback, useState } from 'react'
import { Bookmark, KeyRound, Replace, Signpost } from 'lucide-react'
import { dashboardTexts } from '../texts'
import s from './DashboardHeaderUI.module.css'
import { Button } from '@/components/ui/button'
import { SimpleTooltip } from '@/components/ui/tooltip'
import { downloadFromUrl } from '@/lib/download'

type Props = {
  proxyListenAddress: string | null
  onBreakpointsEntryClick: () => void
  onOverridesEntryClick: () => void
  onSavedRequestsEntryClick: () => void
}

export function DashboardHeaderUI({
  proxyListenAddress,
  onBreakpointsEntryClick,
  onOverridesEntryClick,
  onSavedRequestsEntryClick,
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

        <SimpleTooltip
          label={t.downloadCaTooltip}
        >
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
        <SimpleTooltip label={t.openOverridesTooltip}>
          <Button
            type="button"
            variant="ghost"
            aria-label={t.openOverridesAriaLabel}
            onClick={onOverridesEntryClick}
          >
            <Replace />
          </Button>
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
        <SimpleTooltip label={t.openBreakpointsTooltip}>
          <Button
            type="button"
            variant="ghost"
            aria-label={t.openBreakpointsAriaLabel}
            onClick={onBreakpointsEntryClick}
          >
            <Signpost />
          </Button>
        </SimpleTooltip>
      </div>
    </header>
  )
}
