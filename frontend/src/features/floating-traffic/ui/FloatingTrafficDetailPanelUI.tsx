import { ScrollArea } from '@/components/ui/scroll-area'
import { focusMainWindow } from '@/lib/focusMainWindow'
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
        <button type="button" className="primary" onClick={handleOpenMain}>
          {t.openMainWindow}
        </button>
      </footer>
    </section>
  )
}
