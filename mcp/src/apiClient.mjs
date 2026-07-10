import { DASHBOARD_FETCH_TIMEOUT_MS } from "./constants.mjs";

function dashboardUnreachableMessage(baseUrl, cause) {
  const detail = cause ? ` (${cause})` : "";
  return (
    `LeoProxy 未启动或 dashboard 不可达: ${baseUrl}${detail}. ` +
    `请先启动 LeoProxy（桌面应用或 proxy-app），确认 ${baseUrl}/api/health 可访问。本地 MCP 无需 OAuth。`
  );
}

function isAbortError(error) {
  return (
    error?.name === "AbortError" ||
    error?.name === "TimeoutError" ||
    /aborted|timeout/i.test(String(error?.message ?? ""))
  );
}

function isConnectionError(error) {
  const message = String(error?.message ?? error ?? "");
  const code = error?.cause?.code || error?.code;
  return (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "EHOSTUNREACH" ||
    /fetch failed|ECONNREFUSED|network/i.test(message)
  );
}

async function fetchDashboard(baseUrl, path, options = {}) {
  const timeoutMs = Number(options.timeoutMs ?? DASHBOARD_FETCH_TIMEOUT_MS);
  const url = `${baseUrl}${path}`;
  let response;
  try {
    response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(dashboardUnreachableMessage(baseUrl, `超时 ${timeoutMs}ms`));
    }
    if (isConnectionError(error)) {
      throw new Error(dashboardUnreachableMessage(baseUrl, error?.cause?.code || error.message));
    }
    throw new Error(dashboardUnreachableMessage(baseUrl, error instanceof Error ? error.message : String(error)));
  }
  return response;
}

async function readJsonOrNull(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text);
}

export async function apiGetJson(baseUrl, path, options = {}) {
  const response = await fetchDashboard(baseUrl, path, {
    method: "GET",
    timeoutMs: options.timeoutMs,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for GET ${path}`);
  }
  return readJsonOrNull(response);
}

export async function apiPostJson(baseUrl, path, body, options = {}) {
  const response = await fetchDashboard(baseUrl, path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    timeoutMs: options.timeoutMs,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} for POST ${path}: ${detail}`);
  }
  return readJsonOrNull(response);
}

export async function apiPutJson(baseUrl, path, body, options = {}) {
  const response = await fetchDashboard(baseUrl, path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    timeoutMs: options.timeoutMs,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} for PUT ${path}: ${detail}`);
  }
  return readJsonOrNull(response);
}

export async function apiDelete(baseUrl, path, options = {}) {
  const response = await fetchDashboard(baseUrl, path, {
    method: "DELETE",
    timeoutMs: options.timeoutMs,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} for DELETE ${path}: ${detail}`);
  }
  if (response.status === 204) {
    return null;
  }
  return readJsonOrNull(response);
}

export async function probeDashboard(baseUrl, timeoutMs = 2000) {
  try {
    const health = await apiGetJson(baseUrl, "/api/health", { timeoutMs });
    return { reachable: true, health };
  } catch (error) {
    return {
      reachable: false,
      health: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
