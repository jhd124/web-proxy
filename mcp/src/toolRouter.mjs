import {
  handleFilterTraffic,
  handleListenTraffic,
} from "./handlers/trafficHandlers.mjs";
import {
  handleAddBreakpoint,
  handleAddOverride,
  handleOperateUi,
} from "./handlers/ruleHandlers.mjs";
import {
  handleApplyHosts,
  handleListHosts,
  handleRemoveHost,
  handleRevertHosts,
  handleUpsertHost,
} from "./handlers/hostsHandlers.mjs";
import { disableSystemProxy, enableSystemProxy } from "./systemProxy.mjs";

export const TOOL_HANDLERS = {
  listen_traffic: handleListenTraffic,
  filter_traffic: handleFilterTraffic,
  add_override: handleAddOverride,
  add_breakpoint: handleAddBreakpoint,
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
