import { apiGetJson, apiPostJson, apiPutJson } from "../apiClient.mjs";
import { resolveDashboardUrl } from "../constants.mjs";
import { enableSystemProxy, getSystemProxyStatus } from "../systemProxy.mjs";
import { buildOverridePayload } from "./ruleHandlers.mjs";

function sameOptionalString(left, right) {
  const a = typeof left === "string" && left.length > 0 ? left : null;
  const b = typeof right === "string" && right.length > 0 ? right : null;
  return a === b;
}

function parseMapRemoteTarget(target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    throw new Error(`invalid target URL: ${target}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("target must be http:// or https://");
  }
  const pathname = url.pathname || "/";
  return {
    mapRemoteProtocol: url.protocol.replace(":", ""),
    mapRemoteHost: url.host,
    mapRemotePath: pathname === "/" ? "*" : pathname,
  };
}

function findExistingMapRemote(rules, match) {
  return (Array.isArray(rules) ? rules : []).find((rule) => {
    if (!rule || typeof rule !== "object") {
      return false;
    }
    if (!sameOptionalString(rule.matchHost, match.matchHost)) {
      return false;
    }
    if (!sameOptionalString(rule.matchProtocol, match.matchProtocol)) {
      return false;
    }
    if (!sameOptionalString(rule.matchPath, match.matchPath)) {
      return false;
    }
    if (rule.matchMethod) {
      return false;
    }
    const headers = Array.isArray(rule.matchRequestHeaders)
      ? rule.matchRequestHeaders
      : [];
    const query = Array.isArray(rule.matchQuery) ? rule.matchQuery : [];
    if (headers.length > 0 || query.length > 0) {
      return false;
    }
    if (rule.matchRequestBody) {
      return false;
    }
    return Boolean(rule.mapRemoteHost);
  });
}

async function probeTarget(target) {
  const startedAt = Date.now();
  try {
    const response = await fetch(target, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(3000),
    });
    return {
      ok: response.status >= 200 && response.status < 500,
      status: response.status,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function handleMapRemote(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  const matchHost =
    typeof args.matchHost === "string" ? args.matchHost.trim() : "";
  if (!matchHost) {
    throw new Error("matchHost is required");
  }
  const target = typeof args.target === "string" ? args.target.trim() : "";
  if (!target) {
    throw new Error("target is required (e.g. http://localhost:3000)");
  }

  const matchProtocol =
    typeof args.matchProtocol === "string" && args.matchProtocol.trim()
      ? args.matchProtocol.trim()
      : "https";
  const matchPath =
    typeof args.matchPath === "string" && args.matchPath.trim()
      ? args.matchPath.trim()
      : "*";
  const mapped = parseMapRemoteTarget(target);
  const ensureProxy = args.ensureProxy === true;

  const rules = await apiGetJson(baseUrl, "/api/overrides");
  const existing = findExistingMapRemote(rules, {
    matchHost,
    matchProtocol,
    matchPath,
  });

  const payload = buildOverridePayload({
    enabled: args.enabled ?? true,
    matchProtocol,
    matchHost,
    matchPath,
    status: 200,
    body: "",
    ...mapped,
  });

  let action = "created";
  let rule;
  if (existing?.id) {
    rule = await apiPutJson(
      baseUrl,
      `/api/overrides/${encodeURIComponent(existing.id)}`,
      payload,
    );
    action = "updated";
  } else {
    rule = await apiPostJson(baseUrl, "/api/overrides", payload);
    action = "created";
  }

  let proxy = null;
  if (ensureProxy) {
    proxy = await enableSystemProxy(args);
  } else {
    proxy = getSystemProxyStatus(args);
  }

  const probe = await probeTarget(target);

  return {
    ok: true,
    action,
    id: rule?.id ?? existing?.id ?? null,
    match: { matchProtocol, matchHost, matchPath },
    target: mapped,
    ensureProxy,
    proxy,
    probe,
    override: rule,
  };
}
