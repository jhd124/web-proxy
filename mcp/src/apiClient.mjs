export async function apiGetJson(baseUrl, path) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for GET ${path}`);
  }
  return response.json();
}

export async function apiPostJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} for POST ${path}: ${detail}`);
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text);
}

export async function apiPutJson(baseUrl, path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`HTTP ${response.status} for PUT ${path}: ${detail}`);
  }
  const text = await response.text();
  if (!text) {
    return null;
  }
  return JSON.parse(text);
}
