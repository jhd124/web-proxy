export const tools = [
  {
    name: "listen_traffic",
    description:
      "Listen for new traffic entries from dashboard. Returns when new entries arrive or timeout.",
    inputSchema: {
      type: "object",
      properties: {
        dashboardUrl: { type: "string" },
        sinceId: { type: "string" },
        timeoutMs: { type: "number", minimum: 100, maximum: 120000 },
        pollIntervalMs: { type: "number", minimum: 100, maximum: 10000 },
        limit: { type: "number", minimum: 1, maximum: 1000 },
      },
    },
  },
  {
    name: "filter_traffic",
    description: "Filter captured traffic by query, method, host, status and flags.",
    inputSchema: {
      type: "object",
      properties: {
        dashboardUrl: { type: "string" },
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
    name: "add_override",
    description: "Create an override rule on dashboard /api/overrides.",
    inputSchema: {
      type: "object",
      properties: {
        dashboardUrl: { type: "string" },
        enabled: { type: "boolean" },
        matchMethod: { type: "string" },
        matchProtocol: { type: "string" },
        matchHost: { type: "string" },
        matchPath: { type: "string" },
        matchRequestHeaders: {
          type: "array",
          items: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            items: { type: "string" },
          },
        },
        matchQuery: {
          type: "array",
          items: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            items: { type: "string" },
          },
        },
        matchRequestBody: { type: "string" },
        status: { type: "number", minimum: 100, maximum: 599 },
        headers: {
          type: "array",
          items: {
            type: "array",
            minItems: 2,
            maxItems: 2,
            items: { type: "string" },
          },
        },
        body: { type: "string" },
        mapRemoteProtocol: { type: "string" },
        mapRemoteHost: { type: "string" },
        mapRemotePath: { type: "string" },
        streamIntervalMs: { type: "number", minimum: 1 },
      },
      required: ["matchHost"],
    },
  },
  {
    name: "add_breakpoint",
    description: "Create a breakpoint rule on dashboard /api/breakpoints.",
    inputSchema: {
      type: "object",
      properties: {
        dashboardUrl: { type: "string" },
        name: { type: "string" },
        enabled: { type: "boolean" },
        matchMethod: { type: "string" },
        matchOrigin: { type: "string" },
        matchPathRegex: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "operate_ui",
    description:
      "Operate dashboard UI: focus main window, open floating traffic, select request, or set URL filter.",
    inputSchema: {
      type: "object",
      properties: {
        dashboardUrl: { type: "string" },
        action: {
          type: "string",
          enum: [
            "focus_main_window",
            "open_floating_traffic_window",
            "select_request",
            "set_url_filter",
          ],
        },
        requestId: { type: "string" },
        query: { type: "string" },
      },
      required: ["action"],
    },
  },
  {
    name: "enable_proxy",
    description:
      "Enable macOS system HTTP/HTTPS proxy to 127.0.0.1:<proxyPort> on primary network service.",
    inputSchema: {
      type: "object",
      properties: {
        dashboardUrl: { type: "string" },
        serviceName: { type: "string" },
        proxyPort: { type: "number", minimum: 1, maximum: 65535 },
      },
    },
  },
  {
    name: "disable_proxy",
    description:
      "Disable macOS system HTTP/HTTPS proxy on primary network service.",
    inputSchema: {
      type: "object",
      properties: {
        serviceName: { type: "string" },
      },
    },
  },
  {
    name: "list_hosts",
    description: "List proxy-app managed hosts entries and system apply status.",
    inputSchema: {
      type: "object",
      properties: {
        dashboardUrl: { type: "string" },
      },
    },
  },
  {
    name: "upsert_host",
    description: "Create or update one proxy-app managed hosts entry.",
    inputSchema: {
      type: "object",
      properties: {
        dashboardUrl: { type: "string" },
        address: { type: "string" },
        hostname: { type: "string" },
        enabled: { type: "boolean" },
        comment: { type: "string" },
      },
      required: ["hostname"],
    },
  },
  {
    name: "remove_host",
    description: "Remove one proxy-app managed hosts entry by hostname.",
    inputSchema: {
      type: "object",
      properties: {
        dashboardUrl: { type: "string" },
        hostname: { type: "string" },
      },
      required: ["hostname"],
    },
  },
  {
    name: "apply_hosts",
    description:
      "Ask dashboard backend to apply proxy-app managed hosts block to the system hosts file.",
    inputSchema: {
      type: "object",
      properties: {
        dashboardUrl: { type: "string" },
      },
    },
  },
  {
    name: "revert_hosts",
    description:
      "Ask dashboard backend to remove proxy-app managed hosts block from the system hosts file.",
    inputSchema: {
      type: "object",
      properties: {
        dashboardUrl: { type: "string" },
      },
    },
  },
];
