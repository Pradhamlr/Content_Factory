export async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || "Request failed.");
  }

  return payload;
}

export function buildExportFile(name, payload, type = "application/json") {
  const blob = new Blob([type === "application/json" ? JSON.stringify(payload, null, 2) : payload], { type });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.URL.revokeObjectURL(url);
}
