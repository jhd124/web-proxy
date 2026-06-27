import type { HostsState, ManagedHostEntry } from '../../types'

async function readJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `HTTP ${response.status}`)
  }
  return (await response.json()) as T
}

export async function fetchHostsState(signal?: AbortSignal): Promise<HostsState> {
  const response = await fetch('/api/hosts', { signal })
  return readJsonResponse<HostsState>(response)
}

export async function saveHostsEntries(
  entries: ManagedHostEntry[],
): Promise<HostsState> {
  const response = await fetch('/api/hosts', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ entries }),
  })
  return readJsonResponse<HostsState>(response)
}

export async function applyHostsDirectly(): Promise<HostsState> {
  const response = await fetch('/api/hosts/apply', { method: 'POST' })
  return readJsonResponse<HostsState>(response)
}

export async function revertHostsDirectly(): Promise<HostsState> {
  const response = await fetch('/api/hosts/revert', { method: 'POST' })
  return readJsonResponse<HostsState>(response)
}
