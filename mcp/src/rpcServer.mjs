import { handleJsonRpcMessage, parseJsonMessage } from "./protocol.mjs";

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

export function startStdioServer({ protocolVersion, serverName, serverVersion, tools, callTool }) {
  const protocolContext = {
    protocolVersion,
    serverName,
    serverVersion,
    tools,
    callTool,
  };

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

      const parsed = parseJsonMessage(body);
      if (!parsed.ok) {
        continue;
      }

      void handleJsonRpcMessage(parsed.message, protocolContext).then((response) => {
        if (!response) {
          return;
        }
        if ("result" in response) {
          sendResponse(response.id, response.result);
          return;
        }
        sendError(response.id, response.error.code, response.error.message);
      });
    }
  });

  process.stdin.on("end", () => {
    process.exit(0);
  });
}
