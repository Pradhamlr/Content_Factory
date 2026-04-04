import { pool, isDatabaseConfigured } from "../config/database.js";
import { buildCampaignState } from "../utils/campaignState.js";

function normalizeCampaignRow(row) {
  if (!row) {
    return null;
  }

  const payload = buildCampaignState({
    campaignId: row.campaign_id,
    requestId: row.request_id,
    source: row.source,
    facts: row.facts,
    content: row.content,
    status: row.status,
    reviewStatus: row.review_status,
    approvals: row.approvals,
    deployment: row.deployment,
    telemetry: row.telemetry,
    revisionHistory: row.revision_history
  });

  payload.feedback = row.feedback || "";
  payload.attempts = row.attempts || 0;
  payload.createdAt = row.created_at;
  payload.updatedAt = row.updated_at;

  return payload;
}

function buildCampaignSummary(payload) {
  const blog = String(payload?.content?.blog || "").trim();
  const previewTitle =
    String(payload?.facts?.valueProposition || "").trim() ||
    blog.split("\n").map((line) => line.trim()).find(Boolean) ||
    payload?.source?.label ||
    "Untitled Campaign";

  return {
    campaignId: payload?.campaignId,
    requestId: payload?.requestId,
    source: payload?.source || null,
    status: payload?.status || "PENDING",
    reviewStatus: payload?.reviewStatus || payload?.status || "PENDING",
    approvals: payload?.approvals || { blog: false, tweets: false, email: false },
    deployment: payload?.deployment || { deployed: false, deployedAt: null, deployedChannels: [] },
    telemetry: payload?.telemetry || {},
    previewTitle,
    updatedAt: payload?.updatedAt || payload?.telemetry?.requestCompletedAt || null,
    createdAt: payload?.createdAt || payload?.telemetry?.requestStartedAt || null
  };
}

export async function ensureCampaignSchema() {
  if (!isDatabaseConfigured || !pool) {
    return false;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      campaign_id TEXT PRIMARY KEY,
      request_id TEXT UNIQUE NOT NULL,
      source JSONB NOT NULL DEFAULT '{}'::jsonb,
      facts JSONB NOT NULL DEFAULT '{}'::jsonb,
      content JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL,
      review_status TEXT NOT NULL,
      approvals JSONB NOT NULL DEFAULT '{}'::jsonb,
      deployment JSONB NOT NULL DEFAULT '{}'::jsonb,
      telemetry JSONB NOT NULL DEFAULT '{}'::jsonb,
      revision_history JSONB NOT NULL DEFAULT '{}'::jsonb,
      feedback TEXT NOT NULL DEFAULT '',
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS campaigns_updated_at_idx
    ON campaigns (updated_at DESC);
  `);

  return true;
}

export async function saveCampaign(payload) {
  if (!isDatabaseConfigured || !pool || !payload?.campaignId || !payload?.requestId) {
    return payload;
  }

  const query = `
    INSERT INTO campaigns (
      campaign_id,
      request_id,
      source,
      facts,
      content,
      status,
      review_status,
      approvals,
      deployment,
      telemetry,
      revision_history,
      feedback,
      attempts,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13, NOW(), NOW()
    )
    ON CONFLICT (campaign_id) DO UPDATE SET
      request_id = EXCLUDED.request_id,
      source = EXCLUDED.source,
      facts = EXCLUDED.facts,
      content = EXCLUDED.content,
      status = EXCLUDED.status,
      review_status = EXCLUDED.review_status,
      approvals = EXCLUDED.approvals,
      deployment = EXCLUDED.deployment,
      telemetry = EXCLUDED.telemetry,
      revision_history = EXCLUDED.revision_history,
      feedback = EXCLUDED.feedback,
      attempts = EXCLUDED.attempts,
      updated_at = NOW()
    RETURNING *;
  `;

  const values = [
    payload.campaignId,
    payload.requestId,
    JSON.stringify(payload.source || {}),
    JSON.stringify(payload.facts || {}),
    JSON.stringify(payload.content || {}),
    payload.status || "PENDING",
    payload.reviewStatus || payload.status || "PENDING",
    JSON.stringify(payload.approvals || {}),
    JSON.stringify(payload.deployment || {}),
    JSON.stringify(payload.telemetry || {}),
    JSON.stringify(payload.revisionHistory || {}),
    payload.feedback || "",
    payload.attempts || 0
  ];

  const { rows } = await pool.query(query, values);
  return normalizeCampaignRow(rows[0]);
}

export async function getCampaignByRequestId(requestId) {
  if (!isDatabaseConfigured || !pool || !requestId) {
    return null;
  }

  const { rows } = await pool.query(
    `
      SELECT *
      FROM campaigns
      WHERE request_id = $1
      LIMIT 1;
    `,
    [requestId]
  );

  return normalizeCampaignRow(rows[0]);
}

export async function getCampaignById(campaignId) {
  if (!isDatabaseConfigured || !pool || !campaignId) {
    return null;
  }

  const { rows } = await pool.query(
    `
      SELECT *
      FROM campaigns
      WHERE campaign_id = $1
      LIMIT 1;
    `,
    [campaignId]
  );

  return normalizeCampaignRow(rows[0]);
}

export async function listCampaigns(limit = 12) {
  if (!isDatabaseConfigured || !pool) {
    return [];
  }

  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(50, Number(limit))) : 12;
  const { rows } = await pool.query(
    `
      SELECT *
      FROM campaigns
      ORDER BY updated_at DESC
      LIMIT $1;
    `,
    [safeLimit]
  );

  return rows.map((row) => buildCampaignSummary(normalizeCampaignRow(row)));
}

export async function deleteCampaignById(campaignId) {
  if (!isDatabaseConfigured || !pool || !campaignId) {
    return false;
  }

  const { rowCount } = await pool.query(
    `
      DELETE FROM campaigns
      WHERE campaign_id = $1;
    `,
    [campaignId]
  );

  return rowCount > 0;
}

export { buildCampaignSummary };
