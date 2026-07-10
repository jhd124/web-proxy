#!/usr/bin/env node

import {
  DEFAULT_MCP_HTTP_HOST,
  DEFAULT_MCP_HTTP_PORT,
  PROTOCOL_VERSION,
  SERVER_INSTRUCTIONS,
  SERVER_NAME,
  SERVER_VERSION,
} from "./src/constants.mjs";
import { startHttpServer } from "./src/httpServer.mjs";
import { startStdioServer } from "./src/rpcServer.mjs";
import { callTool } from "./src/toolRouter.mjs";
import { tools } from "./src/tools.mjs";

function parseTransportArg() {
  const transportArg = process.argv.find((arg) => arg.startsWith("--transport="));
  if (!transportArg) {
    return null;
  }
  return transportArg.split("=")[1] || null;
}

const protocolContext = {
  protocolVersion: PROTOCOL_VERSION,
  serverName: SERVER_NAME,
  serverVersion: SERVER_VERSION,
  instructions: SERVER_INSTRUCTIONS,
  tools,
  callTool,
};

const resolvedTransport =
  parseTransportArg() || process.env.PROXY_MCP_TRANSPORT || "stdio";

if (resolvedTransport === "http") {
  const host = process.env.PROXY_MCP_HTTP_HOST || DEFAULT_MCP_HTTP_HOST;
  const parsedPort = Number(process.env.PROXY_MCP_HTTP_PORT ?? DEFAULT_MCP_HTTP_PORT);
  const port =
    Number.isFinite(parsedPort) && parsedPort > 0 && parsedPort <= 65535
      ? parsedPort
      : DEFAULT_MCP_HTTP_PORT;

  startHttpServer({
    ...protocolContext,
    host,
    port,
  });
} else {
  startStdioServer(protocolContext);
}
