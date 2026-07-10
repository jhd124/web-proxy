import { spawnSync } from "node:child_process";

import { apiGetJson } from "./apiClient.mjs";
import { resolveDashboardUrl } from "./constants.mjs";

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

function parseProxyBlock(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  let enabled = null;
  let server = null;
  let port = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const lower = line.toLowerCase();
    if (lower.startsWith("enabled:")) {
      enabled = line.split(":").slice(1).join(":").trim().toLowerCase() === "yes";
      continue;
    }
    if (lower.startsWith("server:")) {
      server = line.split(":").slice(1).join(":").trim() || null;
      continue;
    }
    if (lower.startsWith("port:")) {
      const rawPort = Number(line.split(":").slice(1).join(":").trim());
      port = Number.isFinite(rawPort) ? rawPort : null;
    }
  }
  return { enabled, server, port };
}

export function getSystemProxyStatus(rawArgs) {
  const args = rawArgs || {};
  if (process.platform !== "darwin") {
    return {
      supported: false,
      platform: process.platform,
      message: "system proxy status currently supports macOS only",
    };
  }
  const serviceName =
    (typeof args.serviceName === "string" && args.serviceName.trim()) ||
    resolvePrimaryNetworkService();
  if (!serviceName) {
    return {
      supported: true,
      platform: "darwin",
      serviceName: null,
      enabled: false,
      message: "cannot determine active network service",
    };
  }
  const httpText = commandOutput("networksetup", ["-getwebproxy", serviceName]);
  const httpsText = commandOutput("networksetup", [
    "-getsecurewebproxy",
    serviceName,
  ]);
  const http = parseProxyBlock(httpText);
  const https = parseProxyBlock(httpsText);
  const enabled = Boolean(http.enabled || https.enabled);
  return {
    supported: true,
    platform: "darwin",
    serviceName,
    enabled,
    http,
    https,
  };
}

export async function enableSystemProxy(rawArgs) {
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

export async function disableSystemProxy(rawArgs) {
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
