import JSZip from "jszip";

function serializeJson(value) {
  return `${JSON.stringify(value || {}, null, 2)}\n`;
}

function toMarkdownHeading(title, level = 1) {
  return `${"#".repeat(level)} ${title}\n`;
}

function buildSocialThreadText(tweets = []) {
  if (!Array.isArray(tweets) || !tweets.length) {
    return "No social thread generated.\n";
  }

  return tweets.map((tweet, index) => `${index + 1}. ${tweet}`).join("\n\n");
}

function buildComplianceReport(campaign) {
  return serializeJson({
    campaignId: campaign?.campaignId,
    requestId: campaign?.requestId,
    status: campaign?.status,
    reviewStatus: campaign?.reviewStatus,
    feedback: campaign?.feedback || "",
    telemetry: campaign?.telemetry || {},
    approvals: campaign?.approvals || {},
    deployment: campaign?.deployment || {}
  });
}

function buildRevisionHistoryMarkdown(campaign) {
  const history = campaign?.revisionHistory || {};
  const channels = [
    ["blog", "Blog"],
    ["tweets", "Social Thread"],
    ["email", "Email Teaser"]
  ];

  const lines = [toMarkdownHeading("Revision History"), ""];

  channels.forEach(([key, label]) => {
    const entries = Array.isArray(history[key]) ? history[key] : [];
    lines.push(toMarkdownHeading(label, 2));

    if (!entries.length) {
      lines.push("No revisions recorded.\n");
      return;
    }

    entries.forEach((entry, index) => {
      lines.push(toMarkdownHeading(`Attempt ${index + 1}`, 3));
      lines.push(`- Timestamp: ${entry.timestamp || "N/A"}`);
      lines.push(`- Review Status: ${entry.reviewStatus || "N/A"}`);
      lines.push(`- Campaign Status: ${entry.campaignStatus || "N/A"}`);
      lines.push(`- Preserved Previous: ${entry.preservedPrevious ? "Yes" : "No"}`);
      if (entry.feedback) {
        lines.push(`- Feedback: ${entry.feedback}`);
      }
      lines.push("");
    });
  });

  return lines.join("\n");
}

function buildCampaignManifest(campaign) {
  return serializeJson({
    campaignId: campaign?.campaignId,
    requestId: campaign?.requestId,
    source: campaign?.source || {},
    status: campaign?.status,
    reviewStatus: campaign?.reviewStatus,
    approvals: campaign?.approvals || {},
    deployment: campaign?.deployment || {},
    telemetry: campaign?.telemetry || {},
    artifacts: buildArtifactMetadata(campaign)
  });
}

export function buildArtifactMetadata(campaign) {
  return [
    {
      key: "source",
      title: "Original_Source.txt",
      type: "text/plain",
      route: "source"
    },
    {
      key: "facts",
      title: "Fact_Sheet.json",
      type: "application/json",
      route: "facts"
    },
    {
      key: "blog",
      title: "Blog_Post.md",
      type: "text/markdown",
      route: "blog"
    },
    {
      key: "tweets",
      title: "Social_Thread.txt",
      type: "text/plain",
      route: "tweets"
    },
    {
      key: "email",
      title: "Email_Teaser.txt",
      type: "text/plain",
      route: "email"
    },
    {
      key: "compliance",
      title: "Compliance_Report.json",
      type: "application/json",
      route: "compliance"
    },
    {
      key: "revisions",
      title: "Revision_History.md",
      type: "text/markdown",
      route: "revisions"
    }
  ];
}

export function buildArtifactFile(campaign, artifactKey) {
  const artifact = buildArtifactMetadata(campaign).find((item) => item.key === artifactKey || item.route === artifactKey);

  if (!artifact) {
    return null;
  }

  const sourceText = campaign?.source?.extractedText || campaign?.source?.originalInput || "";

  switch (artifact.key) {
    case "source":
      return {
        ...artifact,
        content: `${sourceText}\n`
      };
    case "facts":
      return {
        ...artifact,
        content: serializeJson(campaign?.facts || {})
      };
    case "blog":
      return {
        ...artifact,
        content: `${toMarkdownHeading("Blog Post")}\n${campaign?.content?.blog || "No blog generated."}\n`
      };
    case "tweets":
      return {
        ...artifact,
        content: `${buildSocialThreadText(campaign?.content?.tweets)}\n`
      };
    case "email":
      return {
        ...artifact,
        content: `${campaign?.content?.email || "No email generated."}\n`
      };
    case "compliance":
      return {
        ...artifact,
        content: buildComplianceReport(campaign)
      };
    case "revisions":
      return {
        ...artifact,
        content: buildRevisionHistoryMarkdown(campaign)
      };
    default:
      return null;
  }
}

export async function buildCampaignZip(campaign) {
  const zip = new JSZip();
  const folderName = `campaign-${campaign?.campaignId || campaign?.requestId || "export"}`;
  const folder = zip.folder(folderName);

  buildArtifactMetadata(campaign).forEach((artifact) => {
    const file = buildArtifactFile(campaign, artifact.key);
    if (file) {
      folder.file(file.title, file.content);
    }
  });

  folder.file("manifest.json", buildCampaignManifest(campaign));

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}
