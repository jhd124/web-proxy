import { apiGetJson } from "../apiClient.mjs";
import { resolveDashboardUrl, sleep } from "../constants.mjs";

export async function handleListenTraffic(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  const timeoutMs = Number(args.timeoutMs ?? 30000);
  const pollIntervalMs = Number(args.pollIntervalMs ?? 800);
  const limit = Number(args.limit ?? 50);
  const sinceId =
    typeof args.sinceId === "string" && args.sinceId.length > 0
      ? args.sinceId
      : null;

  const startedAt = Date.now();
  let lastSeenId = sinceId;

  while (Date.now() - startedAt <= timeoutMs) {
    const list = await apiGetJson(baseUrl, "/api/requests");
    const entries = Array.isArray(list) ? list : [];
    const fromIndex = lastSeenId
      ? entries.findIndex((entry) => entry && entry.id === lastSeenId)
      : -1;
    const newEntries = fromIndex >= 0 ? entries.slice(fromIndex + 1) : entries;
    if (newEntries.length > 0) {
      const trimmed = newEntries.slice(-Math.max(1, limit));
      return {
        matched: true,
        count: trimmed.length,
        lastId: trimmed[trimmed.length - 1]?.id ?? null,
        entries: trimmed,
      };
    }
    lastSeenId = entries[entries.length - 1]?.id ?? lastSeenId;
    await sleep(Math.max(100, pollIntervalMs));
  }

  return {
    matched: false,
    count: 0,
    lastId: lastSeenId,
    entries: [],
    message: "timeout without new traffic",
  };
}

export async function handleFilterTraffic(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  const list = await apiGetJson(baseUrl, "/api/requests");
  const entries = Array.isArray(list) ? list : [];

  const query = typeof args.query === "string" ? args.query.toLowerCase() : "";
  const method = typeof args.method === "string" ? args.method.toUpperCase() : "";
  const host = typeof args.host === "string" ? args.host.toLowerCase() : "";
  const status = Number.isFinite(args.status) ? Number(args.status) : null;
  const hasError = typeof args.hasError === "boolean" ? args.hasError : null;
  const pending = typeof args.pending === "boolean" ? args.pending : null;
  const kind = typeof args.kind === "string" ? args.kind : null;
  const limit = Number(args.limit ?? 100);

  const filtered = entries.filter((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    if (query && !String(entry.url ?? "").toLowerCase().includes(query)) {
      return false;
    }
    if (method && String(entry.method ?? "").toUpperCase() !== method) {
      return false;
    }
    if (host && !String(entry.host ?? "").toLowerCase().includes(host)) {
      return false;
    }
    if (status !== null && Number(entry.responseStatus ?? NaN) !== status) {
      return false;
    }
    if (hasError !== null) {
      const entryHasError = typeof entry.error === "string" && entry.error.length > 0;
      if (entryHasError !== hasError) {
        return false;
      }
    }
    if (pending !== null && Boolean(entry.pending) !== pending) {
      return false;
    }
    if (kind && String(entry.kind ?? "") !== kind) {
      return false;
    }
    return true;
  });

  const trimmed = filtered.slice(-Math.max(1, limit));
  return {
    total: entries.length,
    matched: trimmed.length,
    entries: trimmed,
  };
}
