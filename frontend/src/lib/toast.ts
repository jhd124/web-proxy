import { toast } from 'sonner'

export type ToastLevel = 'success' | 'error' | 'info'

export function showToast(
  message: string,
  level: ToastLevel = 'info',
  durationMs = 2200,
): void {
  if (level === 'success') {
    toast.success(message, { duration: durationMs })
    return
  }
  if (level === 'error') {
    toast.error(message, { duration: durationMs })
    return
  }
  toast(message, { duration: durationMs })
}

export function showSuccessToast(message: string): void {
  showToast(message, 'success')
}
