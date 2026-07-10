const overrideMatchProperties = {
  enabled: { type: "boolean" },
  matchMethod: { type: "string", description: "e.g. GET/POST; omit = any" },
  matchProtocol: { type: "string", description: "http or https" },
  matchHost: { type: "string", description: "Host to match; supports * ?" },
  matchPath: { type: "string", description: "Path to match; use * for all paths" },
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
  mapRemoteProtocol: { type: "string", description: "http or https for map-remote target" },
  mapRemoteHost: { type: "string", description: "e.g. localhost:3000" },
  mapRemotePath: { type: "string", description: "Target path; * keeps request path mapping" },
  streamIntervalMs: { type: "number", minimum: 1 },
};

/** Override / map-remote / breakpoint / status tools。 */
export const ruleTools = [
  {
    name: "get_status",
    description:
      "Aggregate LeoProxy status: dashboard reachability, /api/health (MITM, capturePaused, ports), macOS system proxy on/off, and override rule summary. Call this first. No OAuth required.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "map_remote",
    description:
      "Intent tool: map a remote host to a local/dev target (idempotent upsert). Prefer this over add_override for 「把 A 转到 localhost」. Example: matchHost=platform.test.bohrium.com, target=http://localhost:3000, matchProtocol=https → https://platform.test.bohrium.com/* to http://localhost:3000/*. Set ensureProxy=true to also enable macOS system proxy.",
    inputSchema: {
      type: "object",
      properties: {
        matchHost: { type: "string", description: "Source host to intercept" },
        target: {
          type: "string",
          description: "Destination base URL, e.g. http://localhost:3000",
        },
        matchProtocol: {
          type: "string",
          description: "Source protocol to match; default https",
        },
        matchPath: {
          type: "string",
          description: "Source path pattern; default *",
        },
        ensureProxy: {
          type: "boolean",
          description: "If true, enable macOS system proxy after upsert",
        },
        enabled: { type: "boolean" },
      },
      required: ["matchHost", "target"],
    },
  },
  {
    name: "list_overrides",
    description:
      "List override rules (id, enabled, match*, mapRemote*). Always list before creating to avoid duplicates.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "add_override",
    description:
      "Create an override rule. For map-remote prefer map_remote. Canonical map-remote via this tool: matchProtocol=https, matchHost=platform.test.bohrium.com, matchPath=*, mapRemoteProtocol=http, mapRemoteHost=localhost:3000, mapRemotePath=* (maps https://platform.test.bohrium.com/* → http://localhost:3000/*).",
    inputSchema: {
      type: "object",
      properties: overrideMatchProperties,
      required: ["matchHost"],
    },
  },
  {
    name: "update_override",
    description:
      "Update an existing override by id. Unspecified fields keep previous values. Changing match fields may change the rule id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        ...overrideMatchProperties,
      },
      required: ["id"],
    },
  },
  {
    name: "delete_override",
    description: "Delete an override rule by id.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "set_override_enabled",
    description: "Enable or disable an override without changing other fields.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        enabled: { type: "boolean" },
      },
      required: ["id", "enabled"],
    },
  },
  {
    name: "add_breakpoint",
    description: "Create a breakpoint rule to pause matching requests for inspection.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        enabled: { type: "boolean" },
        matchMethod: { type: "string" },
        matchOrigin: { type: "string" },
        matchPathRegex: { type: "string" },
      },
      required: ["name"],
    },
  },
];
