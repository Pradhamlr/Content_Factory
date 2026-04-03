function formatStatus(status) {
  return String(status || "idle").replace(/_/g, " ").toUpperCase();
}

function formatDuration(ms) {
  if (!ms || ms <= 0) {
    return "--";
  }

  if (ms < 1000) {
    return `${ms}ms`;
  }

  return `${(ms / 1000).toFixed(1)}s`;
}

function countWords(value) {
  if (typeof value !== "string" || !value.trim()) {
    return 0;
  }

  return value.trim().split(/\s+/).length;
}

function getAmbiguities(result) {
  const ambiguities = Array.isArray(result?.facts?.ambiguities) ? result.facts.ambiguities : [];

  return ambiguities
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }

      if (item && typeof item === "object") {
        return item.statement || item.issue || item.text || JSON.stringify(item);
      }

      return "";
    })
    .filter(Boolean);
}

function buildArtifacts(result) {
  if (!result?.content) {
    return [];
  }

  const artifacts = [];

  if (result.content.blog) {
    artifacts.push({
      icon: "description",
      iconClass: "is-cyan",
      title: "Blog_Post.md",
      meta: `${countWords(result.content.blog)} words`
    });
  }

  if (Array.isArray(result.content.tweets) && result.content.tweets.length) {
    artifacts.push({
      icon: "alternate_email",
      iconClass: "is-cyan",
      title: "Social_Thread.json",
      meta: `${result.content.tweets.length} posts`
    });
  }

  if (result.content.email) {
    artifacts.push({
      icon: "mail",
      iconClass: "is-green",
      title: "Email_Teaser.txt",
      meta: `${countWords(result.content.email)} words`
    });
  }

  artifacts.push({
    icon: "fact_check",
    iconClass: result.status === "APPROVED" ? "is-green" : "is-cyan",
    title: "Compliance_Report.json",
    meta: result.status || "READY"
  });

  return artifacts;
}

function buildTasks(result) {
  if (!result) {
    return [];
  }

  const tasks = [];

  if (result.status === "APPROVED") {
    tasks.push("Approved campaign is ready for final review");
  } else if (result.feedback) {
    tasks.push("Editor feedback is available for revision");
  }

  if (Array.isArray(result.content?.tweets) && result.content.tweets.length) {
    tasks.push(`Social thread contains ${result.content.tweets.length} ready-to-review posts`);
  }

  if (result.content?.email) {
    tasks.push("Email teaser is available for approval");
  }

  if (result.telemetry?.ambiguityCount) {
    tasks.push(`${result.telemetry.ambiguityCount} ambiguity flag(s) need brand review`);
  }

  return tasks;
}

function buildVerdict(result) {
  const attempts = Number(result?.attempts || 0);
  const approved = result?.status === "APPROVED";

  if (!attempts) {
    return {
      label: "Waiting for first review",
      detail: "Gatekeeper verdict will appear after the first campaign run.",
      className: ""
    };
  }

  if (approved && attempts > 1) {
    return {
      label: `Approved on attempt ${attempts}`,
      detail: `Initial draft was rejected, then refined through ${attempts - 1} feedback cycle${attempts - 1 === 1 ? "" : "s"}.`,
      className: "is-approved"
    };
  }

  if (approved) {
    return {
      label: "Approved on first pass",
      detail: "The initial draft cleared validation without a rewrite cycle.",
      className: "is-approved"
    };
  }

  return {
    label: `Rejected after ${attempts} attempt${attempts === 1 ? "" : "s"}`,
    detail: result?.feedback || "The editor flagged issues that still need correction.",
    className: "is-rejected"
  };
}

function AgentCard({ title, status, active, complete, blocked, accent }) {
  return (
    <article className={`war-agent-card ${active ? "is-active" : ""} ${complete ? "is-complete" : ""} ${blocked ? "is-blocked" : ""} ${accent ? `is-${accent}` : ""}`}>
      <div className={`war-agent-card__icon ${accent ? `is-${accent}` : ""}`}>
        <span className="material-symbols-outlined">
          {accent === "brain" ? "psychology" : accent === "voice" ? "graphic_eq" : "verified_user"}
        </span>
        <span className={`war-agent-card__status-dot ${complete ? "is-on" : ""}`} aria-hidden="true"></span>
      </div>
      <h3>{title}</h3>
      <div className="war-agent-card__status">STATUS: {formatStatus(status)}</div>
    </article>
  );
}

export default function AgentsView({ liveLogs, agentStages, loading, result, hasCampaign, deployment }) {
  const logs = liveLogs.length
    ? liveLogs
    : loading
    ? [{ message: "War room stream connected. Waiting for first event...", type: "system", timestamp: new Date().toISOString() }]
    : [{ message: "Awaiting campaign generation. Start from the Campaigns page to populate the collaborative core.", type: "system", timestamp: new Date().toISOString() }];

  const telemetry = result?.telemetry;
  const artifacts = buildArtifacts(result);
  const tasks = buildTasks(result);
  const ambiguities = getAmbiguities(result);
  const verdict = buildVerdict(result);
  const attempts = Number(result?.attempts || 0);

  const diagnostics = {
    pipelineState: loading ? "ACTIVE" : result?.status || "--",
    researchMs: telemetry?.stageTimings?.researcherMs || 0,
    writingMs: telemetry?.stageTimings?.writerMs || 0,
    editingMs: telemetry?.stageTimings?.editorMs || 0,
    totalMs: telemetry?.durationMs || 0
  };

  const intelligence = {
    features: telemetry?.featureCount || 0,
    audience: telemetry?.audienceCount || 0,
    ambiguities: telemetry?.ambiguityCount || 0
  };

  const deploymentState = {
    deployed: Boolean(deployment?.deployed),
    channels: Array.isArray(deployment?.deployedChannels) ? deployment.deployedChannels : [],
    deployedAt: deployment?.deployedAt || null
  };

  const researcherStatus = agentStages.researcher.status;
  const writerStatus = agentStages.writer.status;
  const editorStatus = agentStages.editor.status;

  return (
    <div className="war-room-page">
      <div className="war-room-main">
        <div className="war-room-summary">
          <div className="war-room-summary__eyebrow">Multi-Agent Pipeline</div>
          <h2>Iterative validation with feedback optimization across research, writing, and editorial control.</h2>
          <p>Research &rarr; Write &rarr; Validate &rarr; Refine</p>
        </div>

        <div className="war-room-agents">
          <AgentCard
            title="ANALYTICAL BRAIN"
            status={researcherStatus}
            active={researcherStatus === "running"}
            complete={researcherStatus === "complete"}
            accent="brain"
          />
          <div className="war-room-link"></div>
          <AgentCard
            title="THE VOICE"
            status={writerStatus}
            active={writerStatus === "running"}
            complete={writerStatus === "complete"}
            accent="voice"
          />
          <div className="war-room-link"></div>
          <AgentCard
            title="THE GATEKEEPER"
            status={editorStatus}
            active={editorStatus === "running"}
            blocked={editorStatus === "rejected"}
            complete={editorStatus === "complete"}
            accent="gatekeeper"
          />
        </div>

        <div className="war-room-flow">
          <span>Research</span>
          <span className="material-symbols-outlined">east</span>
          <span>Write</span>
          <span className="material-symbols-outlined">east</span>
          <span>Validate</span>
          <span className="material-symbols-outlined">east</span>
          <span>Refine</span>
        </div>

        <section className="war-room-stream">
          <div className="war-room-stream__head">
            <div className="war-room-stream__head-title">
              <span className="material-symbols-outlined">forum</span>
              <h3>COLLABORATIVE LOGIC STREAM</h3>
            </div>
            <div className="war-room-stream__dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>

          <div className="war-room-stream__body">
            {logs.map((entry, index) => (
              <div key={`${entry.timestamp}-${index}`} className={`war-room-log war-room-log--${entry.type || "system"}`}>
                <span className="war-room-log__time">
                  [{new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}]
                </span>
                <div className="war-room-log__message">
                  <span className="war-room-log__badge">
                    {entry.type === "researcher" ? "BRAIN" : entry.type === "writer" ? "VOICE" : entry.type === "editor" ? "GATEKEEPER" : "SYSTEM"}
                  </span>
                  <span>{entry.message}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="war-room-stream__input">
            <span className="war-room-stream__input-label">OVERRIDE CMD:</span>
            <span className="war-room-stream__input-placeholder">ENTER SYSTEM OVERRIDE OR FEEDBACK...</span>
            <button type="button" className="war-room-stream__input-button" aria-label="Send override">
              <span className="material-symbols-outlined">terminal</span>
            </button>
          </div>
        </section>

        <div className="war-room-intelligence-grid">
          <section className="war-room-insight-card">
            <div className="war-room-insight-card__title">Iteration Intelligence</div>
            {hasCampaign ? (
              <div className="war-room-insight-card__body">
                <div className="war-room-insight-stat">
                  <span>Refinement Cycles</span>
                  <strong>{attempts || 1}</strong>
                </div>
                <div className="war-room-checklist">
                  <div>
                    <span>Initial Draft</span>
                    <strong className={attempts > 1 ? "is-rejected" : "is-approved"}>{attempts > 1 ? "Rejected" : "Approved"}</strong>
                  </div>
                  <div>
                    <span>Final Output</span>
                    <strong className={result?.status === "APPROVED" ? "is-approved" : "is-rejected"}>{result?.status || "--"}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="war-room-empty">Iteration history becomes visible after the first pipeline run.</div>
            )}
          </section>

          <section className="war-room-insight-card">
            <div className="war-room-insight-card__title">System Intelligence</div>
            {hasCampaign ? (
              <div className="war-room-insight-metrics">
                <div>
                  <span>Features Extracted</span>
                  <strong>{intelligence.features}</strong>
                </div>
                <div>
                  <span>Audience Segments</span>
                  <strong>{intelligence.audience}</strong>
                </div>
                <div>
                  <span>Ambiguities</span>
                  <strong className={intelligence.ambiguities ? "is-warning" : ""}>{intelligence.ambiguities}</strong>
                </div>
              </div>
            ) : (
              <div className="war-room-empty">Extraction metrics appear after the Analytical Brain completes.</div>
            )}
          </section>
        </div>

        <section className="war-room-ambiguities">
          <div className="war-room-ambiguities__header">
            <div className="war-room-ambiguities__title">
              <span className="material-symbols-outlined">warning</span>
              <h3>Ambiguities Detected {hasCampaign ? `(${ambiguities.length})` : ""}</h3>
            </div>
          </div>
          {hasCampaign && ambiguities.length ? (
            <ul className="war-room-ambiguities__list">
              {ambiguities.slice(0, 6).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : (
            <div className="war-room-empty">Source uncertainty flags from the Analytical Brain will be surfaced here.</div>
          )}
        </section>
      </div>

      <aside className="war-room-sidebar">
        <section className="war-room-panel">
          <div className="war-room-panel__header">
            <div>
              <div className="war-room-panel__title">Pipeline Performance</div>
              <div className="war-room-panel__subtitle">LIVE RUN TELEMETRY</div>
            </div>
            <button type="button" className="war-room-panel__action" aria-label="Analytics">
              <span className="material-symbols-outlined">analytics</span>
            </button>
          </div>
          <div className="war-room-panel__label-row">
            <span>Pipeline State</span>
            <strong>{diagnostics.pipelineState}</strong>
          </div>
          <div className="war-room-meter">
            <div className="war-room-meter__row">
              <span>Research</span>
              <strong>{hasCampaign ? formatDuration(diagnostics.researchMs) : "--"}</strong>
            </div>
            <div className="war-room-meter__track">
              <div style={{ width: hasCampaign ? `${Math.min(100, Math.max(10, diagnostics.researchMs / 30))}%` : "0%" }}></div>
            </div>
          </div>
          <div className="war-room-meter">
            <div className="war-room-meter__row">
              <span>Writing</span>
              <strong>{hasCampaign ? formatDuration(diagnostics.writingMs) : "--"}</strong>
            </div>
            <div className="war-room-meter__track">
              <div style={{ width: hasCampaign ? `${Math.min(100, Math.max(10, diagnostics.writingMs / 30))}%` : "0%" }}></div>
            </div>
          </div>
          <div className="war-room-meter">
            <div className="war-room-meter__row">
              <span>Editing</span>
              <strong>{hasCampaign ? formatDuration(diagnostics.editingMs) : "--"}</strong>
            </div>
            <div className="war-room-meter__track">
              <div style={{ width: hasCampaign ? `${Math.min(100, Math.max(10, diagnostics.editingMs / 30))}%` : "0%" }}></div>
            </div>
          </div>
          <div className="war-room-meter">
            <div className="war-room-meter__row">
              <span>Total</span>
              <strong>{hasCampaign ? formatDuration(diagnostics.totalMs) : "--"}</strong>
            </div>
            <div className="war-room-meter__track is-green">
              <div style={{ width: hasCampaign ? `${Math.min(100, Math.max(12, diagnostics.totalMs / 120))}%` : "0%" }}></div>
            </div>
          </div>
        </section>

        <section className="war-room-panel">
          <div className="war-room-panel__title">Gatekeeper Verdict</div>
          {hasCampaign ? (
            <div className={`war-room-verdict ${verdict.className}`}>
              <strong>{verdict.label}</strong>
              <p>{verdict.detail}</p>
            </div>
          ) : (
            <div className="war-room-empty">Editorial verdict appears after the first review cycle.</div>
          )}
        </section>

        <section className="war-room-panel">
          <div className="war-room-panel__title">Deployment Status</div>
          {hasCampaign ? (
            <div className="war-room-deployment">
              <div className="war-room-panel__label-row">
                <span>Status</span>
                <strong>{deploymentState.deployed ? "Deployed" : "Not Deployed"}</strong>
              </div>
              <div className="war-room-deployment__channels">
                {deploymentState.channels.length ? deploymentState.channels.map((channel) => <span key={channel}>{channel}</span>) : <em>Channels: --</em>}
              </div>
              <small>{deploymentState.deployedAt ? new Date(deploymentState.deployedAt).toLocaleString() : "Deploy from Preview when approvals are ready."}</small>
            </div>
          ) : (
            <div className="war-room-empty">Deployment state is unlocked after a campaign run.</div>
          )}
        </section>

        <section className="war-room-panel">
          <div className="war-room-panel__title">Recent Artifacts</div>
          {artifacts.length ? (
            artifacts.map((artifact) => (
              <div key={artifact.title} className="war-room-artifact">
                <span className={`material-symbols-outlined ${artifact.iconClass}`}>{artifact.icon}</span>
                <div>
                  <strong>{artifact.title}</strong>
                  <small>{artifact.meta}</small>
                </div>
              </div>
            ))
          ) : (
            <div className="war-room-empty">Artifacts will appear after a campaign run completes.</div>
          )}
        </section>

        <section className="war-room-panel war-room-panel--accent">
          <div className="war-room-panel__title">Run Outcomes</div>
          {tasks.length ? (
            <ul>
              {tasks.map((task) => (
                <li key={task}>{task}</li>
              ))}
            </ul>
          ) : (
            <div className="war-room-empty">No downstream tasks until a campaign starts.</div>
          )}
        </section>

        <section className="war-room-footer-stats">
          <div>
            <span>TOTAL RUN TIME</span>
            <strong>{telemetry?.durationMs ? formatDuration(telemetry.durationMs) : "--"}</strong>
          </div>
          <div>
            <span>EVENT COUNT</span>
            <strong>{hasCampaign ? String(logs.length).padStart(2, "0") : "--"}</strong>
          </div>
        </section>
      </aside>
    </div>
  );
}
