import { ScrollArea } from '@/components/ui/scroll-area'
import { copyTextToClipboard } from '@/lib/clipboard'
import { focusMainWindow } from '@/lib/focusMainWindow'
import { buildCurlCommand } from '@/lib/curl'
import { showSuccessToast, showToast } from '@/lib/toast'
import type { TrafficEntry } from '../../../types'
import { floatingTrafficTexts as t } from '../texts'
import s from './FloatingTrafficDetailPanelUI.module.css'

type FloatingTrafficDetailPanelUIProps = {
  entry: TrafficEntry
}

export function FloatingTrafficDetailPanelUI({
  entry,
}: FloatingTrafficDetailPanelUIProps) {
  const handleOpenMain = () => {
    void focusMainWindow(entry.id).catch((error) => {
      window.alert(
        t.openMainFailed(error instanceof Error ? error.message : String(error)),
      )
    })
  }
  const handleCopyCurl = () => {
    const curl = buildCurlCommand(entry)
    void copyTextToClipboard(curl)
      .then(() => {
        showSuccessToast(t.copyCurlSuccess)
      })
      .catch((error) => {
        const detail = error instanceof Error ? error.message : String(error)
        showToast(t.copyCurlFailed(detail), 'error')
      })
  }

  return (
    <section className={s.panel} aria-label={t.detailTitle}>
      <ScrollArea className={s.body}>
        <section className={s.section}>
          <h3 className={s.label}>{t.detailUrl}</h3>
          <p className={`mono small ${s.url}`}>{entry.url}</p>
        </section>

        {entry.requestBodyPreview && (
          <section className={s.section}>
            <h3 className={s.label}>{t.detailRequestBody}</h3>
            <pre className={s.pre}>{entry.requestBodyPreview}</pre>
          </section>
        )}

        <section className={s.section}>
          <h3 className={s.label}>{t.detailResponse}</h3>
          {entry.pending && !entry.responseStatus && !entry.error && (
            <p className="small muted">{t.detailNoResponse}</p>
          )}
          {entry.error && <p className="small err">{entry.error}</p>}
          {entry.responseStatus != null && (
            <p className="mono small">HTTP {entry.responseStatus}</p>
          )}
          {entry.responseBodyPreview ? (
            <pre className={s.pre}>{entry.responseBodyPreview}</pre>
          ) : (
            !entry.error &&
            entry.responseStatus != null && (
              <p className="small muted">{t.detailNoBody}</p>
            )
          )}
        </section>
      </ScrollArea>

      <footer className={s.footer}>
        <div className={s.footerActions}>
          <button type="button" className="ghost" onClick={handleCopyCurl}>
            {t.copyCurl}
          </button>
          <button type="button" className="primary" onClick={handleOpenMain}>
            {t.openMainWindow}
          </button>
        </div>
      </footer>
    </section>
  )
}
