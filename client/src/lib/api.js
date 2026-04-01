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

export function buildCampaignKitFile(name, { input, result, approvals, deployment }) {
  const content = result?.content || {};
  const facts = result?.facts || {};
  const lines = [
    "# Autonomous Content Factory Campaign Kit",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Request ID: ${result?.requestId || "N/A"}`,
    `Status: ${result?.status || "N/A"}`,
    "",
    "## Approvals",
    `- Blog: ${approvals?.blog ? "Approved" : "Pending"}`,
    `- Social Thread: ${approvals?.tweets ? "Approved" : "Pending"}`,
    `- Email Teaser: ${approvals?.email ? "Approved" : "Pending"}`,
    "",
    "## Deployment",
    `- Deployed: ${deployment?.deployed ? "Yes" : "No"}`,
    `- Deployed At: ${deployment?.deployedAt || "N/A"}`,
    `- Channels: ${(deployment?.deployedChannels || []).join(", ") || "None"}`,
    "",
    "## Source Document",
    input || "N/A",
    "",
    "## Facts",
    JSON.stringify(facts, null, 2),
    "",
    "## Blog Post",
    content.blog || "N/A",
    "",
    "## Social Thread",
    Array.isArray(content.tweets) ? content.tweets.map((tweet, index) => `${index + 1}. ${tweet}`).join("\n") : "N/A",
    "",
    "## Email Teaser",
    content.email || "N/A"
  ].join("\n");

  buildExportFile(name, lines, "text/markdown");
}
