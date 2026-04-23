import { dashboardTexts } from '../texts'
import s from './DashboardHeaderUI.module.css'

type Ws = 'connecting' | 'open' | 'closed'

type Props = {
  wsStatus: Ws
  urlFilterTrimmed: string
  filteredCount: number
  totalCount: number
}

function statusPillClass(status: Ws): string {
  if (status === 'open') return s.pillOk
  if (status === 'connecting') return s.pillWarn
  return s.pillBad
}

export function DashboardHeaderUI({
  wsStatus,
  urlFilterTrimmed,
  filteredCount,
  totalCount,
}: Props) {
  const t = dashboardTexts.header
  return (
    <header className={s.top}>
      <div className={s.brand}>
        <span className={s.dot} />
        <h1>{t.title}</h1>
      </div>
      <div className={s.meta}>
        <span className={statusPillClass(wsStatus)}>{t.wsPill(wsStatus)}</span>
        <span className={s.pillSubtle}>
          {urlFilterTrimmed
            ? t.countFiltered(filteredCount, totalCount)
            : t.countAll(totalCount)}
        </span>
        <code className={s.hint}>{t.proxyExportHint}</code>
      </div>
    </header>
  )
}
