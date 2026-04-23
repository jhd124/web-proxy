type Ws = 'connecting' | 'open' | 'closed'

type Props = {
  wsStatus: Ws
  urlFilterTrimmed: string
  filteredCount: number
  totalCount: number
}

export function DashboardHeader({
  wsStatus,
  urlFilterTrimmed,
  filteredCount,
  totalCount,
}: Props) {
  return (
    <header className="top">
      <div className="brand">
        <span className="dot" />
        <h1>Proxy dashboard</h1>
      </div>
      <div className="meta">
        <span
          className={`pill ${
            wsStatus === 'open' ? 'ok' : wsStatus === 'connecting' ? 'warn' : 'bad'
          }`}
        >
          WS {wsStatus}
        </span>
        <span className="pill subtle">
          {urlFilterTrimmed
            ? `${filteredCount} / ${totalCount} shown`
            : `${totalCount} captured`}
        </span>
        <code className="hint">
          export HTTP_PROXY=http://127.0.0.1:9090 HTTPS_PROXY=http://127.0.0.1:9090
        </code>
      </div>
    </header>
  )
}
