import { useCallback, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '../../../lib/tauriEnv'
import { dashboardTexts } from '../texts'
import s from './MitmBannerUI.module.css'

type Props = {
  mitmCaPemPath: string | null
}

export function MitmBannerUI({ mitmCaPemPath }: Props) {
  const t = dashboardTexts.mitm
  const [busy, setBusy] = useState<'install' | 'open' | null>(null)

  const canUseDesktop = isTauri() && mitmCaPemPath != null
  const isMac =
    typeof navigator !== 'undefined' &&
    (navigator.userAgent.includes('Mac OS X') ||
      navigator.userAgent.includes('Mac OS') ||
      navigator.platform?.toLowerCase().includes('mac') === true)

  const installSystemTrust = useCallback(async () => {
    if (!mitmCaPemPath) return
    setBusy('install')
    try {
      await invoke('install_mitm_ca_system_trust', {
        caPemPath: mitmCaPemPath,
      })
    } catch (e) {
      window.alert(
        t.desktopInstallFailed(e instanceof Error ? e.message : String(e)),
      )
    } finally {
      setBusy(null)
    }
  }, [mitmCaPemPath, t])

  const openPemFile = useCallback(async () => {
    if (!mitmCaPemPath) return
    setBusy('open')
    try {
      await invoke('open_mitm_ca_file', { caPemPath: mitmCaPemPath })
    } catch (e) {
      window.alert(
        t.desktopOpenFailed(e instanceof Error ? e.message : String(e)),
      )
    } finally {
      setBusy(null)
    }
  }, [mitmCaPemPath, t])

  return (
    <div className={s.banner}>
      <strong>{t.strong}</strong> {t.beforeLink}{' '}
      <a href={t.linkPath} download={t.linkDownload}>
        {t.linkPath}
      </a>{' '}
      {t.afterLink}
      {canUseDesktop && (
        <div className={s.desktopActions}>
          {isMac && (
            <button
              type="button"
              className={s.btn}
              disabled={busy !== null}
              onClick={() => void installSystemTrust()}
            >
              {busy === 'install' ? '…' : t.desktopMacInstall}
            </button>
          )}
          <button
            type="button"
            className={s.btn}
            disabled={busy !== null}
            onClick={() => void openPemFile()}
          >
            {busy === 'open' ? '…' : t.desktopOpenFile}
          </button>
        </div>
      )}
    </div>
  )
}
