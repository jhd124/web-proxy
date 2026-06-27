import { apiGetJson, apiPostJson, apiPutJson } from "../apiClient.mjs";
import { resolveDashboardUrl } from "../constants.mjs";

function normalizeEntry(args) {
  return {
    address: typeof args.address === "string" ? args.address : "127.0.0.1",
    hostname: typeof args.hostname === "string" ? args.hostname : "",
    enabled: args.enabled ?? true,
    comment: typeof args.comment === "string" ? args.comment : "",
  };
}

export async function handleListHosts(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  return apiGetJson(baseUrl, "/api/hosts");
}

export async function handleUpsertHost(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  const hostname = typeof args.hostname === "string" ? args.hostname.trim() : "";
  if (!hostname) {
    throw new Error("hostname is required");
  }
  const state = await apiGetJson(baseUrl, "/api/hosts");
  const nextEntry = normalizeEntry(args);
  const entries = Array.isArray(state.entries) ? state.entries : [];
  const index = entries.findIndex(
    (entry) =>
      typeof entry.hostname === "string" &&
      entry.hostname.toLowerCase() === hostname.toLowerCase(),
  );
  const nextEntries =
    index >= 0
      ? entries.map((entry, entryIndex) => (entryIndex === index ? nextEntry : entry))
      : [...entries, nextEntry];
  return apiPutJson(baseUrl, "/api/hosts", { entries: nextEntries });
}

export async function handleRemoveHost(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  const hostname = typeof args.hostname === "string" ? args.hostname.trim() : "";
  if (!hostname) {
    throw new Error("hostname is required");
  }
  const state = await apiGetJson(baseUrl, "/api/hosts");
  const entries = Array.isArray(state.entries) ? state.entries : [];
  const nextEntries = entries.filter(
    (entry) =>
      typeof entry.hostname !== "string" ||
      entry.hostname.toLowerCase() !== hostname.toLowerCase(),
  );
  return apiPutJson(baseUrl, "/api/hosts", { entries: nextEntries });
}

export async function handleApplyHosts(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  return apiPostJson(baseUrl, "/api/hosts/apply", {});
}

export async function handleRevertHosts(rawArgs) {
  const args = rawArgs || {};
  const baseUrl = resolveDashboardUrl(args);
  return apiPostJson(baseUrl, "/api/hosts/revert", {});
}
