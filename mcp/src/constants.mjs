export const PROTOCOL_VERSION = "2024-11-05";
export const SERVER_NAME = "proxy-dashboard-mcp";
export const SERVER_VERSION = "0.1.0";
export const DEFAULT_DASHBOARD_URL = "http://127.0.0.1:9091";
export const DEFAULT_MCP_HTTP_HOST = "127.0.0.1";
export const DEFAULT_MCP_HTTP_PORT = 19091;

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function resolveDashboardUrl(args) {
  const raw =
    (args && typeof args.dashboardUrl === "string" && args.dashboardUrl) ||
    process.env.PROXY_DASHBOARD_URL ||
    DEFAULT_DASHBOARD_URL;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

export function asPairArray(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item) => Array.isArray(item) && item.length >= 2)
    .map((item) => [String(item[0] ?? ""), String(item[1] ?? "")]);
}
