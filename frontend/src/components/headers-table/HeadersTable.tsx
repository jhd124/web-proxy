import s from './HeadersTable.module.css'

type Props = {
  headers: [string, string][] | null | undefined
}

export function HeadersTable({ headers }: Props) {
  if (!headers || headers.length === 0) return null
  return (
    <div className={s.table}>
      {headers.map(([key, value], i) => (
        <div key={i} className={s.row}>
          <span className={s.key}>{key}</span>
          <span className={s.value}>{value}</span>
        </div>
      ))}
    </div>
  )
}
