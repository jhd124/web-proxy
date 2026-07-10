export const PROTOCOL_VERSION = "2024-11-05";
export const SERVER_NAME = "LeoProxy";
export const SERVER_VERSION = "0.2.0";
export const DEFAULT_DASHBOARD_URL = "http://127.0.0.1:9091";
export const DEFAULT_MCP_HTTP_HOST = "127.0.0.1";
export const DEFAULT_MCP_HTTP_PORT = 19091;
export const DASHBOARD_FETCH_TIMEOUT_MS = 5000;

/** MCP initialize.instructions：给 Agent 的使用说明（无需 OAuth）。 */
export const SERVER_INSTRUCTIONS = [
  "LeoProxy MCP 连接本地 dashboard，不需要 OAuth / mcp_auth。",
  "若工具报错「未启动或 dashboard 不可达」，请先启动 LeoProxy 桌面应用或 proxy-app。",
  "推荐先调用 get_status 确认健康与代理状态。",
  "用户说「把 A 转到 localhost」时优先用 map_remote，不要手拼 add_override。",
  "改规则前先 list_overrides，避免重复创建。",
  `默认 dashboard: ${DEFAULT_DASHBOARD_URL}（可用环境变量 PROXY_DASHBOARD_URL 覆盖）。`,
].join(" ");

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
