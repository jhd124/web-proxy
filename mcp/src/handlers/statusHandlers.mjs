import { apiGetJson, probeDashboard } from "../apiClient.mjs";
import { resolveDashboardUrl } from "../constants.mjs";
import { getSystemProxyStatus } from "../systemProxy.mjs";
import { summarizeOverride } from "./ruleHandlers.mjs";

export async function handleGetStatus(rawArgs) {
  const args = rawArgs || {};
  const dashboardUrl = resolveDashboardUrl(args);
  const probe = await probeDashboard(dashboardUrl);
  const systemProxy = getSystemProxyStatus(args);

  if (!probe.reachable) {
    return {
      ok: false,
      dashboardUrl,
      dashboardReachable: false,
      message:
        "LeoProxy 未启动或 dashboard 不可达。本地 MCP 无需 OAuth；请启动应用后重试。",
      error: probe.error,
      health: null,
      systemProxy,
      capturePaused: null,
      mitmEnabled: null,
      overrides: { total: 0, enabledCount: 0, summary: [] },
    };
  }

  const health = probe.health ?? {};
  let overridesSummary = { total: 0, enabledCount: 0, summary: [] };
  try {
    const rules = await apiGetJson(dashboardUrl, "/api/overrides");
    const list = Array.isArray(rules) ? rules : [];
    overridesSummary = {
      total: list.length,
      enabledCount: list.filter((rule) => rule && rule.enabled).length,
      summary: list.slice(0, 20).map(summarizeOverride),
    };
  } catch (error) {
    overridesSummary = {
      total: 0,
      enabledCount: 0,
      summary: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    ok: true,
    dashboardUrl,
    dashboardReachable: true,
    health,
    systemProxy,
    capturePaused: Boolean(health.capturePaused),
    mitmEnabled: Boolean(health.mitmEnabled),
    proxyPort: health.proxyPort ?? null,
    dashboardPort: health.dashboardPort ?? null,
    overrides: overridesSummary,
  };
}
