/** 流量相关 MCP tools（不含 dashboardUrl，默认走 PROXY_DASHBOARD_URL）。 */
export const trafficTools = [
  {
    name: "listen_traffic",
    description:
      "Listen for new captured traffic until new entries arrive or timeout. Returns list-level summaries (no headers/body). Use get_request for details.",
    inputSchema: {
      type: "object",
      properties: {
        sinceId: { type: "string", description: "Only return entries after this request id" },
        timeoutMs: { type: "number", minimum: 100, maximum: 120000 },
        pollIntervalMs: { type: "number", minimum: 100, maximum: 10000 },
        limit: { type: "number", minimum: 1, maximum: 1000 },
      },
    },
  },
  {
    name: "filter_traffic",
    description:
      "Filter captured traffic by query/method/host/status/flags. List-level only; use get_request(id) for headers/body/timing/error.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        method: { type: "string" },
        host: { type: "string" },
        status: { type: "number" },
        hasError: { type: "boolean" },
        pending: { type: "boolean" },
        kind: { type: "string", enum: ["http", "connect"] },
        limit: { type: "number", minimum: 1, maximum: 1000 },
      },
    },
  },
  {
    name: "get_request",
    description:
      "Get one traffic entry detail by id: request/response headers, body previews, durationMs, error, pending, override/breakpoint match ids.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Traffic entry id from filter_traffic / listen_traffic" },
      },
      required: ["id"],
    },
  },
  {
    name: "clear_traffic",
    description: "Clear all captured traffic entries on the dashboard.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "pause_capture",
    description: "Pause capturing new traffic (existing entries remain).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "resume_capture",
    description: "Resume capturing new traffic after pause_capture.",
    inputSchema: { type: "object", properties: {} },
  },
];
