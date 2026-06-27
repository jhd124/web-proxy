import { apiPostJson } from "../apiClient.mjs";
import { asPairArray, resolveDashboardUrl } from "../constants.mjs";

export async function handleAddOverride(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  const payload = {
    enabled: args.enabled ?? true,
    matchMethod:
      typeof args.matchMethod === "string" ? args.matchMethod : null,
    matchProtocol:
      typeof args.matchProtocol === "string" ? args.matchProtocol : null,
    matchHost: typeof args.matchHost === "string" ? args.matchHost : null,
    matchPath: typeof args.matchPath === "string" ? args.matchPath : null,
    matchRequestHeaders: asPairArray(args.matchRequestHeaders),
    matchQuery: asPairArray(args.matchQuery),
    matchRequestBody:
      typeof args.matchRequestBody === "string" ? args.matchRequestBody : null,
    status: Number(args.status ?? 200),
    headers: asPairArray(args.headers),
    body: typeof args.body === "string" ? args.body : "",
    mapRemoteProtocol:
      typeof args.mapRemoteProtocol === "string" ? args.mapRemoteProtocol : null,
    mapRemoteHost:
      typeof args.mapRemoteHost === "string" ? args.mapRemoteHost : null,
    mapRemotePath:
      typeof args.mapRemotePath === "string" ? args.mapRemotePath : null,
    streamIntervalMs:
      args.streamIntervalMs == null ? null : Number(args.streamIntervalMs),
  };
  return apiPostJson(baseUrl, "/api/overrides", payload);
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
    matchMethod:
      typeof args.matchMethod === "string" ? args.matchMethod : null,
    matchOrigin: typeof args.matchOrigin === "string" ? args.matchOrigin : null,
    matchPathRegex:
      typeof args.matchPathRegex === "string" ? args.matchPathRegex : null,
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
