import {
  handleFilterTraffic,
  handleListenTraffic,
} from "./handlers/trafficHandlers.mjs";
import {
  handleAddBreakpoint,
  handleAddOverride,
  handleOperateUi,
} from "./handlers/ruleHandlers.mjs";
import { disableSystemProxy, enableSystemProxy } from "./systemProxy.mjs";

export const TOOL_HANDLERS = {
  listen_traffic: handleListenTraffic,
  filter_traffic: handleFilterTraffic,
  add_override: handleAddOverride,
  add_breakpoint: handleAddBreakpoint,
  operate_ui: handleOperateUi,
  enable_proxy: enableSystemProxy,
  disable_proxy: disableSystemProxy,
};

export async function callTool(name, args) {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    throw new Error(`unknown tool: ${name}`);
  }
  return handler(args);
}
