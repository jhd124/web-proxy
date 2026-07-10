import { apiDelete, apiGetJson, apiPostJson, apiPutJson } from "../apiClient.mjs";
import { asPairArray, resolveDashboardUrl } from "../constants.mjs";

function optionalString(value) {
  return typeof value === "string" ? value : null;
}

function buildOverridePayload(args, fallback = {}) {
  const source = { ...fallback, ...args };
  return {
    enabled: source.enabled ?? true,
    matchMethod: optionalString(source.matchMethod),
    matchProtocol: optionalString(source.matchProtocol),
    matchHost: optionalString(source.matchHost),
    matchPath: optionalString(source.matchPath),
    matchRequestHeaders: asPairArray(
      source.matchRequestHeaders ?? fallback.matchRequestHeaders,
    ),
    matchQuery: asPairArray(source.matchQuery ?? fallback.matchQuery),
    matchRequestBody: optionalString(source.matchRequestBody),
    status: Number(source.status ?? fallback.status ?? 200),
    headers: asPairArray(source.headers ?? fallback.headers),
    body: typeof source.body === "string" ? source.body : (fallback.body ?? ""),
    mapRemoteProtocol: optionalString(source.mapRemoteProtocol),
    mapRemoteHost: optionalString(source.mapRemoteHost),
    mapRemotePath: optionalString(source.mapRemotePath),
    streamIntervalMs:
      source.streamIntervalMs == null
        ? (fallback.streamIntervalMs ?? null)
        : Number(source.streamIntervalMs),
  };
}

function summarizeOverride(rule) {
  return {
    id: rule.id,
    enabled: Boolean(rule.enabled),
    matchProtocol: rule.matchProtocol ?? null,
    matchHost: rule.matchHost ?? null,
    matchPath: rule.matchPath ?? null,
    mapRemoteProtocol: rule.mapRemoteProtocol ?? null,
    mapRemoteHost: rule.mapRemoteHost ?? null,
    mapRemotePath: rule.mapRemotePath ?? null,
    status: rule.status ?? null,
  };
}

export async function handleListOverrides(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  const rules = await apiGetJson(baseUrl, "/api/overrides");
  const list = Array.isArray(rules) ? rules : [];
  return {
    total: list.length,
    enabledCount: list.filter((rule) => rule && rule.enabled).length,
    overrides: list.map(summarizeOverride),
  };
}

export async function handleAddOverride(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  if (typeof args.matchHost !== "string" || args.matchHost.trim().length === 0) {
    throw new Error("matchHost is required");
  }
  return apiPostJson(baseUrl, "/api/overrides", buildOverridePayload(args));
}

export async function handleUpdateOverride(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!id) {
    throw new Error("id is required");
  }
  const rules = await apiGetJson(baseUrl, "/api/overrides");
  const existing = (Array.isArray(rules) ? rules : []).find((rule) => rule?.id === id);
  if (!existing) {
    throw new Error(`override not found: ${id}`);
  }
  const payload = buildOverridePayload(args, existing);
  if (!payload.matchHost || String(payload.matchHost).trim().length === 0) {
    throw new Error("matchHost is required");
  }
  return apiPutJson(baseUrl, `/api/overrides/${encodeURIComponent(id)}`, payload);
}

export async function handleDeleteOverride(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!id) {
    throw new Error("id is required");
  }
  await apiDelete(baseUrl, `/api/overrides/${encodeURIComponent(id)}`);
  return { ok: true, id };
}

export async function handleSetOverrideEnabled(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  const id = typeof args.id === "string" ? args.id.trim() : "";
  if (!id) {
    throw new Error("id is required");
  }
  if (typeof args.enabled !== "boolean") {
    throw new Error("enabled (boolean) is required");
  }
  const rules = await apiGetJson(baseUrl, "/api/overrides");
  const existing = (Array.isArray(rules) ? rules : []).find((rule) => rule?.id === id);
  if (!existing) {
    throw new Error(`override not found: ${id}`);
  }
  const payload = buildOverridePayload({ enabled: args.enabled }, existing);
  const updated = await apiPutJson(
    baseUrl,
    `/api/overrides/${encodeURIComponent(id)}`,
    payload,
  );
  return { ok: true, id: updated?.id ?? id, enabled: Boolean(updated?.enabled ?? args.enabled), override: updated };
}

export async function handleAddBreakpoint(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  const payload = {
    name:
      typeof args.name === "string" && args.name.length > 0
        ? args.name
        : "MCP Breakpoint",
    enabled: args.enabled ?? true,
    matchMethod: optionalString(args.matchMethod),
    matchOrigin: optionalString(args.matchOrigin),
    matchPathRegex: optionalString(args.matchPathRegex),
  };
  return apiPostJson(baseUrl, "/api/breakpoints", payload);
}

export async function handleOperateUi(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  const action = String(args.action ?? "");
  if (!action) {
    throw new Error("action is required");
  }
  const payload = { action };
  if (action === "select_request") {
    if (typeof args.requestId !== "string" || args.requestId.length === 0) {
      throw new Error("requestId is required when action=select_request");
    }
    payload.requestId = args.requestId;
  }
  if (action === "set_url_filter") {
    payload.query = typeof args.query === "string" ? args.query : "";
  }
  await apiPostJson(baseUrl, "/api/ui/actions", payload);
  return { ok: true, action };
}

export { buildOverridePayload, summarizeOverride };
