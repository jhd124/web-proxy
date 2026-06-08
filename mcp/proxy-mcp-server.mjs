#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "proxy-dashboard-mcp";
const SERVER_VERSION = "0.1.0";
const DEFAULT_DASHBOARD_URL = "http://127.0.0.1:9091";

const tools = [
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
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveDashboardUrl(args) {
  const raw =
    (args && typeof args.dashboardUrl === "string" && args.dashboardUrl) ||
    process.env.PROXY_DASHBOARD_URL ||
    DEFAULT_DASHBOARD_URL;
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

function asPairArray(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item) => Array.isArray(item) && item.length >= 2)
    .map((item) => [String(item[0] ?? ""), String(item[1] ?? "")]);
}

async function apiGetJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for GET ${path}`);
  }
  return response.json();
}

async function apiPostJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} for POST ${path}: ${detail}`);
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text);
}

function runCommandOrThrow(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout ?? "";
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    return null;
  }
  return result.stdout ?? "";
}

function parseDefaultRouteInterface(routeOutput) {
  const lines = String(routeOutput).split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line.toLowerCase().startsWith("interface:")) {
      continue;
    }
    const iface = line.split(":").slice(1).join(":").trim();
    if (iface) {
      return iface;
    }
  }
  return null;
}

function findServiceByDevice(deviceName) {
  const text = commandOutput("networksetup", ["-listallhardwareports"]);
  if (!text) {
    return null;
  }
  const lines = text.split(/\r?\n/);
  let pendingPortName = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("Hardware Port:")) {
      pendingPortName = line.slice("Hardware Port:".length).trim();
      continue;
    }
    if (!line.startsWith("Device:")) {
      continue;
    }
    const dev = line.slice("Device:".length).trim();
    if (dev === deviceName) {
      return pendingPortName;
    }
    pendingPortName = null;
  }
  return null;
}

function firstEnabledNetworkService() {
  const text = commandOutput("networksetup", ["-listallnetworkservices"]);
  if (!text) {
    return null;
  }
  const lines = text.split(/\r?\n/).slice(1);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("*")) {
      continue;
    }
    return line;
  }
  return null;
}

function resolvePrimaryNetworkService() {
  const routeText = commandOutput("route", ["-n", "get", "default"]);
  const iface = routeText ? parseDefaultRouteInterface(routeText) : null;
  if (iface && !iface.startsWith("utun") && !iface.startsWith("ipsec")) {
    const mappedService = findServiceByDevice(iface);
    if (mappedService) {
      return mappedService;
    }
  }
  return firstEnabledNetworkService();
}

async function resolveProxyPort(args) {
  if (Number.isFinite(args.proxyPort)) {
    const port = Number(args.proxyPort);
    if (port > 0 && port <= 65535) {
      return port;
    }
  }
  const baseUrl = resolveDashboardUrl(args);
  const health = await apiGetJson(baseUrl, "/api/health");
  const port = Number(health?.proxyPort ?? NaN);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new Error("cannot resolve proxy port from args.proxyPort or /api/health");
  }
  return port;
}

async function handleListenTraffic(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  const timeoutMs = Number(args.timeoutMs ?? 30000);
  const pollIntervalMs = Number(args.pollIntervalMs ?? 800);
  const limit = Number(args.limit ?? 50);
  const sinceId =
    typeof args.sinceId === "string" && args.sinceId.length > 0
      ? args.sinceId
      : null;

  const startedAt = Date.now();
  let lastSeenId = sinceId;

  while (Date.now() - startedAt <= timeoutMs) {
    const list = await apiGetJson(baseUrl, "/api/requests");
    const entries = Array.isArray(list) ? list : [];
    const fromIndex = lastSeenId
      ? entries.findIndex((entry) => entry && entry.id === lastSeenId)
      : -1;
    const newEntries = fromIndex >= 0 ? entries.slice(fromIndex + 1) : entries;
    if (newEntries.length > 0) {
      const trimmed = newEntries.slice(-Math.max(1, limit));
      return {
        matched: true,
        count: trimmed.length,
        lastId: trimmed[trimmed.length - 1]?.id ?? null,
        entries: trimmed,
      };
    }
    lastSeenId = entries[entries.length - 1]?.id ?? lastSeenId;
    await sleep(Math.max(100, pollIntervalMs));
  }

  return {
    matched: false,
    count: 0,
    lastId: lastSeenId,
    entries: [],
    message: "timeout without new traffic",
  };
}

async function handleFilterTraffic(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  const list = await apiGetJson(baseUrl, "/api/requests");
  const entries = Array.isArray(list) ? list : [];

  const query = typeof args.query === "string" ? args.query.toLowerCase() : "";
  const method = typeof args.method === "string" ? args.method.toUpperCase() : "";
  const host = typeof args.host === "string" ? args.host.toLowerCase() : "";
  const status = Number.isFinite(args.status) ? Number(args.status) : null;
  const hasError = typeof args.hasError === "boolean" ? args.hasError : null;
  const pending = typeof args.pending === "boolean" ? args.pending : null;
  const kind = typeof args.kind === "string" ? args.kind : null;
  const limit = Number(args.limit ?? 100);

  const filtered = entries.filter((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }
    if (query && !String(entry.url ?? "").toLowerCase().includes(query)) {
      return false;
    }
    if (method && String(entry.method ?? "").toUpperCase() !== method) {
      return false;
    }
    if (host && !String(entry.host ?? "").toLowerCase().includes(host)) {
      return false;
    }
    if (status !== null && Number(entry.responseStatus ?? NaN) !== status) {
      return false;
    }
    if (hasError !== null) {
      const entryHasError = typeof entry.error === "string" && entry.error.length > 0;
      if (entryHasError !== hasError) {
        return false;
      }
    }
    if (pending !== null && Boolean(entry.pending) !== pending) {
      return false;
    }
    if (kind && String(entry.kind ?? "") !== kind) {
      return false;
    }
    return true;
  });

  const trimmed = filtered.slice(-Math.max(1, limit));
  return {
    total: entries.length,
    matched: trimmed.length,
    entries: trimmed,
  };
}

async function handleAddOverride(rawArgs) {
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

async function handleAddBreakpoint(rawArgs) {
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

async function handleOperateUi(rawArgs) {
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

async function handleEnableProxy(rawArgs) {
  const args = rawArgs || {};
  if (process.platform !== "darwin") {
    throw new Error("enable_proxy currently supports macOS only");
  }
  const serviceName =
    (typeof args.serviceName === "string" && args.serviceName.trim()) ||
    resolvePrimaryNetworkService();
  if (!serviceName) {
    throw new Error("cannot determine active network service");
  }
  const proxyPort = await resolveProxyPort(args);
  const portText = String(proxyPort);
  runCommandOrThrow("networksetup", [
    "-setwebproxy",
    serviceName,
    "127.0.0.1",
    portText,
  ]);
  runCommandOrThrow("networksetup", ["-setwebproxystate", serviceName, "on"]);
  runCommandOrThrow("networksetup", [
    "-setsecurewebproxy",
    serviceName,
    "127.0.0.1",
    portText,
  ]);
  runCommandOrThrow("networksetup", [
    "-setsecurewebproxystate",
    serviceName,
    "on",
  ]);
  return {
    ok: true,
    serviceName,
    proxyHost: "127.0.0.1",
    proxyPort,
    message: "system HTTP/HTTPS proxy enabled",
  };
}

async function handleDisableProxy(rawArgs) {
  const args = rawArgs || {};
  if (process.platform !== "darwin") {
    throw new Error("disable_proxy currently supports macOS only");
  }
  const serviceName =
    (typeof args.serviceName === "string" && args.serviceName.trim()) ||
    resolvePrimaryNetworkService();
  if (!serviceName) {
    throw new Error("cannot determine active network service");
  }
  runCommandOrThrow("networksetup", ["-setwebproxystate", serviceName, "off"]);
  runCommandOrThrow("networksetup", [
    "-setsecurewebproxystate",
    serviceName,
    "off",
  ]);
  return {
    ok: true,
    serviceName,
    message: "system HTTP/HTTPS proxy disabled",
  };
}

async function callTool(name, args) {
  if (name === "listen_traffic") {
    return handleListenTraffic(args);
  }
  if (name === "filter_traffic") {
    return handleFilterTraffic(args);
  }
  if (name === "add_override") {
    return handleAddOverride(args);
  }
  if (name === "add_breakpoint") {
    return handleAddBreakpoint(args);
  }
  if (name === "operate_ui") {
    return handleOperateUi(args);
  }
  if (name === "enable_proxy") {
    return handleEnableProxy(args);
  }
  if (name === "disable_proxy") {
    return handleDisableProxy(args);
  }
  throw new Error(`unknown tool: ${name}`);
}

function toToolResult(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

function sendMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
  process.stdout.write(Buffer.concat([header, body]));
}

function sendResponse(id, result) {
  sendMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  sendMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

async function handleRequest(message) {
  const { id, method, params } = message;
  if (method === "initialize") {
    sendResponse(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
    });
    return;
  }

  if (method === "tools/list") {
    sendResponse(id, { tools });
    return;
  }

  if (method === "tools/call") {
    try {
      const result = await callTool(params?.name, params?.arguments ?? {});
      sendResponse(id, toToolResult(result));
    } catch (error) {
      sendError(id, -32000, error instanceof Error ? error.message : String(error));
    }
    return;
  }

  if (method === "notifications/initialized") {
    return;
  }

  if (id !== undefined) {
    sendError(id, -32601, `method not found: ${method}`);
  }
}

let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const delimiterIndex = buffer.indexOf("\r\n\r\n");
    if (delimiterIndex === -1) {
      break;
    }

    const headerPart = buffer.slice(0, delimiterIndex).toString("utf8");
    const contentLengthLine = headerPart
      .split("\r\n")
      .find((line) => line.toLowerCase().startsWith("content-length:"));
    if (!contentLengthLine) {
      buffer = buffer.slice(delimiterIndex + 4);
      continue;
    }

    const contentLength = Number(contentLengthLine.split(":")[1]?.trim() ?? "0");
    const totalLength = delimiterIndex + 4 + contentLength;
    if (buffer.length < totalLength) {
      break;
    }

    const body = buffer
      .slice(delimiterIndex + 4, delimiterIndex + 4 + contentLength)
      .toString("utf8");
    buffer = buffer.slice(totalLength);

    let message;
    try {
      message = JSON.parse(body);
    } catch (error) {
      continue;
    }
    void handleRequest(message);
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});
