/**
 * 触发浏览器下载：为 Blob 创建 object URL，用隐藏 `<a download>` 点击后延迟回收 URL。
 */
const DOWNLOAD_URL_REVOKE_DELAY_MS = 1000

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, DOWNLOAD_URL_REVOKE_DELAY_MS)
}

/**
 * GET 请求 URL，将响应体作为文件下载；非 2xx 时抛出带 `HTTP <status>` 的 Error。
 */
export async function downloadFromUrl(
  url: string,
  filename: string,
  init?: RequestInit,
): Promise<void> {
  const res = await fetch(url, init)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const blob = await res.blob()
  downloadBlob(blob, filename)
}
