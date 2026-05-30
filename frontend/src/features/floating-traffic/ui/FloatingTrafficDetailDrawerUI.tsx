import { ScrollArea } from '@/components/ui/scroll-area'
import { copyTextToClipboard } from '@/lib/clipboard'
import { focusMainWindow } from '@/lib/focusMainWindow'
import { buildCurlCommand } from '@/lib/curl'
import { showSuccessToast, showToast } from '@/lib/toast'
import type { TrafficEntry } from '../../../types'
import { floatingTrafficTexts as t } from '../texts'
import s from './FloatingTrafficDetailDrawerUI.module.css'

type FloatingTrafficDetailDrawerUIProps = {
  entry: TrafficEntry
  onClose: () => void
}

export function FloatingTrafficDetailDrawerUI({
  entry,
  onClose,
}: FloatingTrafficDetailDrawerUIProps) {
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
    <DetailDrawerBackdrop onClose={onClose}>
      <div
        className={s.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="floating-traffic-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={s.head}>
          <h2 id="floating-traffic-detail-title" className={s.title}>
            {t.detailTitle}
          </h2>
          <button
            type="button"
            className={`ghost ${s.close}`}
            onClick={onClose}
          >
            ×
          </button>
        </header>

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
          <div className="flex items-center gap-2">
            <button type="button" className="ghost flex-1" onClick={handleCopyCurl}>
              {t.copyCurl}
            </button>
            <button type="button" className="primary flex-1" onClick={handleOpenMain}>
              {t.openMainWindow}
            </button>
          </div>
        </footer>
      </div>
    </DetailDrawerBackdrop>
  )
}

function DetailDrawerBackdrop({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div className={s.backdrop} role="presentation" onClick={onClose}>
      {children}
    </div>
  )
}

