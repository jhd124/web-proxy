import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SimpleTooltip } from '@/components/ui/tooltip'
import { Trash } from 'lucide-react'
import {
  getTrafficSchemeLabel,
  getTrafficSummary,
} from '../../traffic/trafficDisplay'
import { floatingTrafficTexts as t } from '../texts'
import type { FloatingTrafficViewModel } from '../types'
import s from './FloatingTrafficUI.module.css'

export function FloatingTrafficUI({
  urlFilter,
  setUrlFilter,
  clearTraffic,
  filteredEntries,
  selectedId,
  setSelectedId,
}: FloatingTrafficViewModel) {
  const entries = [...filteredEntries].reverse()

  return (
    <section className={s.panel}>
      <header className={s.header}>
        <div>
          <Input
            type="search"
            value={urlFilter}
            onChange={(event) => setUrlFilter(event.target.value)}
            placeholder={t.filterPlaceholder}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <SimpleTooltip label={t.clear}>
          <button type="button" className="ghost" onClick={() => void clearTraffic()}>
            <Trash />
          </button>
        </SimpleTooltip>
      </header>

      <ScrollArea className={s.scrollArea}>
        {entries.length === 0 ? (
          <p className={`small muted ${s.empty}`}>{t.empty}</p>
        ) : (
          <ul className={s.list}>
            {entries.map((entry) => {
              const summary = getTrafficSummary(entry)

              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={`${s.row} ${selectedId === entry.id ? s.rowActive : ''}`}
                    onClick={() => setSelectedId(entry.id)}
                  >
                    <span className={s.scheme}>{getTrafficSchemeLabel(entry)}</span>
                    <span className={s.method}>{entry.method}</span>
                    <span className={s.url} title={summary}>
                      {summary}
                    </span>
                    {entry.error && <span className={s.errorTag}>{t.tagError}</span>}
                    {entry.mitmBypassed && (
                      <span className={s.warnTag}>{t.tagBypassed}</span>
                    )}
                    {entry.pending && <span className={s.warnTag}>{t.tagPending}</span>}
                    {entry.responseStatus != null && (
                      <span className={s.status}>{entry.responseStatus}</span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </ScrollArea>
    </section>
  )
}
