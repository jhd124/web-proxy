/** 系统代理 / hosts / UI 操作 tools。 */
export const systemTools = [
  {
    name: "operate_ui",
    description:
      "Operate dashboard UI: focus_main_window, open_floating_traffic_window, select_request (needs requestId), set_url_filter (optional query).",
    inputSchema: {
      type: "object",
      properties: {
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
      "Enable macOS system HTTP/HTTPS proxy to 127.0.0.1:<proxyPort>. proxyPort defaults from /api/health. Prefer map_remote(ensureProxy=true) when mapping remotes.",
    inputSchema: {
      type: "object",
      properties: {
        serviceName: { type: "string" },
        proxyPort: { type: "number", minimum: 1, maximum: 65535 },
      },
    },
  },
  {
    name: "disable_proxy",
    description: "Disable macOS system HTTP/HTTPS proxy on the primary network service.",
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
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "upsert_host",
    description: "Create or update one proxy-app managed hosts entry.",
    inputSchema: {
      type: "object",
      properties: {
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
        hostname: { type: "string" },
      },
      required: ["hostname"],
    },
  },
  {
    name: "apply_hosts",
    description:
      "Ask dashboard backend to apply proxy-app managed hosts block to the system hosts file.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "revert_hosts",
    description:
      "Ask dashboard backend to remove proxy-app managed hosts block from the system hosts file.",
    inputSchema: { type: "object", properties: {} },
  },
];
