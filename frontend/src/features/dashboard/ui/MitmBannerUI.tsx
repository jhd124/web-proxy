import { dashboardTexts } from '../texts'
import s from './MitmBannerUI.module.css'

export function MitmBannerUI() {
  const t = dashboardTexts.mitm
  return (
    <div className={s.banner}>
      <strong>{t.strong}</strong> {t.beforeLink}{' '}
      <a href={t.linkPath} download={t.linkDownload}>
        {t.linkPath}
      </a>{' '}
      {t.afterLink}
    </div>
  )
}
