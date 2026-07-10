import {
  handleClearTraffic,
  handleFilterTraffic,
  handleGetRequest,
  handleListenTraffic,
  handlePauseCapture,
  handleResumeCapture,
} from "./handlers/trafficHandlers.mjs";
import {
  handleAddBreakpoint,
  handleAddOverride,
  handleDeleteOverride,
  handleListOverrides,
  handleOperateUi,
  handleSetOverrideEnabled,
  handleUpdateOverride,
} from "./handlers/ruleHandlers.mjs";
import { handleMapRemote } from "./handlers/mapRemoteHandler.mjs";
import { handleGetStatus } from "./handlers/statusHandlers.mjs";
import {
  handleApplyHosts,
  handleListHosts,
  handleRemoveHost,
  handleRevertHosts,
  handleUpsertHost,
} from "./handlers/hostsHandlers.mjs";
import { disableSystemProxy, enableSystemProxy } from "./systemProxy.mjs";

export const TOOL_HANDLERS = {
  get_status: handleGetStatus,
  map_remote: handleMapRemote,
  list_overrides: handleListOverrides,
  add_override: handleAddOverride,
  update_override: handleUpdateOverride,
  delete_override: handleDeleteOverride,
  set_override_enabled: handleSetOverrideEnabled,
  add_breakpoint: handleAddBreakpoint,
  listen_traffic: handleListenTraffic,
  filter_traffic: handleFilterTraffic,
  get_request: handleGetRequest,
  clear_traffic: handleClearTraffic,
  pause_capture: handlePauseCapture,
  resume_capture: handleResumeCapture,
  operate_ui: handleOperateUi,
  enable_proxy: enableSystemProxy,
  disable_proxy: disableSystemProxy,
  list_hosts: handleListHosts,
  upsert_host: handleUpsertHost,
  remove_host: handleRemoveHost,
  apply_hosts: handleApplyHosts,
  revert_hosts: handleRevertHosts,
};

export async function callTool(name, args) {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    throw new Error(`unknown tool: ${name}`);
  }
  return handler(args);
}
