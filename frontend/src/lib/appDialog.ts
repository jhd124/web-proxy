import { isTauri } from './tauriEnv'

const nativeAlert =
  typeof window !== 'undefined' ? window.alert.bind(window) : undefined
const nativeConfirm =
  typeof window !== 'undefined' ? window.confirm.bind(window) : undefined

function normalizeDialogMessage(message: unknown): string {
  if (typeof message === 'string') return message
  return String(message)
}

async function loadTauriDialogModule() {
  if (!isTauri()) return null
  try {
    return await import('@tauri-apps/plugin-dialog')
  } catch {
    return null
  }
}

export async function alertByEnv(message: unknown): Promise<void> {
  const normalizedMessage = normalizeDialogMessage(message)

  if (!isTauri()) {
    nativeAlert?.(normalizedMessage)
    return
  }

  const tauriDialog = await loadTauriDialogModule()
  if (tauriDialog?.message) {
    await tauriDialog.message(normalizedMessage, { title: 'Proxy' })
    return
  }

  nativeAlert?.(normalizedMessage)
}

export async function confirmByEnv(message: unknown): Promise<boolean> {
  const normalizedMessage = normalizeDialogMessage(message)

  if (!isTauri()) {
    return nativeConfirm?.(normalizedMessage) ?? false
  }

  const tauriDialog = await loadTauriDialogModule()
  if (tauriDialog?.ask) {
    return tauriDialog.ask(normalizedMessage, { title: 'Proxy' })
  }

  return nativeConfirm?.(normalizedMessage) ?? false
}
