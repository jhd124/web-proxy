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

function createErrorResponse(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  };
}

export async function handleJsonRpcMessage(
  message,
  { protocolVersion, serverName, serverVersion, tools, callTool, instructions },
) {
  const id = message?.id;
  const method = message?.method;
  const params = message?.params;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: serverName,
          version: serverVersion,
        },
        ...(typeof instructions === "string" && instructions.length > 0
          ? { instructions }
          : {}),
      },
    };
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: { tools },
    };
  }

  if (method === "tools/call") {
    try {
      const result = await callTool(params?.name, params?.arguments ?? {});
      return {
        jsonrpc: "2.0",
        id,
        result: toToolResult(result),
      };
    } catch (error) {
      return createErrorResponse(
        id,
        -32000,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  if (method === "notifications/initialized") {
    return null;
  }

  if (id !== undefined) {
    return createErrorResponse(id, -32601, `method not found: ${method}`);
  }
  return null;
}

export function parseJsonMessage(rawBody) {
  try {
    const message = JSON.parse(rawBody);
    return { ok: true, message };
  } catch {
    return { ok: false, message: null };
  }
}
