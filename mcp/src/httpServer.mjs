import http from "node:http";

import { handleJsonRpcMessage, parseJsonMessage } from "./protocol.mjs";

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  response.end(payload);
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  });
  response.end(text);
}

export function startHttpServer({
  protocolVersion,
  serverName,
  serverVersion,
  tools,
  callTool,
  instructions,
  host,
  port,
}) {
  const protocolContext = {
    protocolVersion,
    serverName,
    serverVersion,
    tools,
    callTool,
    instructions,
  };

  const server = http.createServer((request, response) => {
    if (!request.url) {
      sendText(response, 404, "not found");
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    const isMcpEndpoint = url.pathname === "/mcp";
    const isHealthEndpoint = url.pathname === "/health";

    if (request.method === "OPTIONS" && isMcpEndpoint) {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      });
      response.end();
      return;
    }

    if (request.method === "GET" && isHealthEndpoint) {
      sendJson(response, 200, {
        ok: true,
        transport: "http",
        endpoint: "/mcp",
      });
      return;
    }

    if (request.method !== "POST" || !isMcpEndpoint) {
      sendText(response, 404, "not found");
      return;
    }

    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 5 * 1024 * 1024) {
        sendText(response, 413, "request too large");
        request.destroy();
      }
    });

    request.on("end", () => {
      const parsed = parseJsonMessage(body);
      if (!parsed.ok) {
        sendJson(response, 400, {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "parse error" },
        });
        return;
      }

      void handleJsonRpcMessage(parsed.message, protocolContext).then((rpcResponse) => {
        if (!rpcResponse) {
          response.writeHead(204, {
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          });
          response.end();
          return;
        }
        sendJson(response, 200, rpcResponse);
      });
    });
  });

  server.listen(port, host, () => {
    process.stderr.write(
      `[mcp] http transport listening on http://${host}:${port}/mcp\n`,
    );
  });

  return server;
}
