import { useRef, useState } from "react";

const STATUS_LABELS = {
  standby: "Ready",
  waiting: "Awaiting Input",
  idle: "Awaiting Review",
  complete: "Completed",
  running: "In Progress",
  rejected: "Needs Revision",
  error: "Needs Attention",
  approved: "Approved",
  active: "Active"
};

function formatStatus(status) {
  const key = String(status || "idle").toLowerCase();
  return (STATUS_LABELS[key] || key.replace(/_/g, " ")).toUpperCase();
}

function formatStatusLabel(status) {
  const key = String(status || "--").toLowerCase();

  if (STATUS_LABELS[key]) {
    return STATUS_LABELS[key];
  }

  return key
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function capitalizeFirstLetter(value) {
  const text = String(value || "").trim();

  if (!text) {
    return "";
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatDuration(ms) {
  if (!ms || ms <= 0) {
    return "--";
  }

  if (ms < 1000) {
    return `${Math.round(ms)} ms`;
  }

  return `${(ms / 1000).toFixed(1)} s`;
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

function normalizeSocialPlatform(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return ["twitter", "linkedin", "reddit"].includes(normalized) ? normalized : "twitter";
}

function getSocialPlatformLabel(value) {
  const normalized = normalizeSocialPlatform(value);
  return normalized === "linkedin" ? "LinkedIn" : normalized === "reddit" ? "Reddit" : "X";
}

function buildArtifacts(result) {
  if (!result?.content) {
    return [];
  }

  const artifacts = [];
  const previewAssets = result?.previewAssets || {};

  if (result.content.blog) {
    artifacts.push({
      key: "blog",
      icon: "description",
      iconClass: "is-cyan",
      title: "Blog_Post.md",
      meta: `${countWords(result.content.blog)} words`
    });
  }

  if (Array.isArray(result.content.tweets) && result.content.tweets.length) {
    artifacts.push({
      key: "tweets",
      icon: "alternate_email",
      iconClass: "is-cyan",
      title: "Social_Thread.json",
      meta: `${result.content.tweets.length} posts`
    });
  }

  if (result.content.email) {
    artifacts.push({
      key: "email",
      icon: "mail",
      iconClass: "is-green",
      title: "Email_Teaser.txt",
      meta: `${countWords(result.content.email)} words`
    });
  }

  artifacts.push({
    key: "compliance",
    icon: "fact_check",
    iconClass: result.status === "APPROVED" ? "is-green" : "is-cyan",
    title: "Compliance_Report.json",
    meta: result.status || "READY"
  });

  if (previewAssets.desktop?.data) {
    artifacts.push({
      key: "desktop-image",
      icon: "image",
      iconClass: "is-cyan",
      title: previewAssets.desktop.contentType?.includes("svg") ? "Desktop_Hero.svg" : "Desktop_Hero.jpg",
      meta: previewAssets.desktop.status === "generated" ? "generated visual" : "fallback visual"
    });
  }

  if (previewAssets.mobile?.data) {
    artifacts.push({
      key: "mobile-image",
      icon: "imagesmode",
      iconClass: "is-cyan",
      title: previewAssets.mobile.contentType?.includes("svg") ? "Social_Preview.svg" : "Social_Preview.jpg",
      meta: previewAssets.mobile.status === "generated" ? "generated visual" : "fallback visual"
    });
  }

  return artifacts;
}

function buildTasks(result) {
  if (!result) {
    return [];
  }

  const tasks = [];

  if (result.status === "APPROVED") {
    tasks.push("Approved campaign is ready for final review.");
  } else if (result.feedback) {
    tasks.push("Gatekeeper feedback is available for the next refinement cycle.");
  }

  if (Array.isArray(result.content?.tweets) && result.content.tweets.length) {
    tasks.push(`Social thread includes ${result.content.tweets.length} review-ready posts.`);
  }

  if (result.content?.email) {
    tasks.push("Email teaser is prepared for editorial sign-off.");
  }

  if (result.telemetry?.ambiguityCount) {
    tasks.push(`${result.telemetry.ambiguityCount} ambiguity flag(s) need human review.`);
  }

  if (result?.source?.socialPlatform) {
    tasks.push(`Social asset is being shaped for ${getSocialPlatformLabel(result.source.socialPlatform)}.`);
  }

  return tasks;
}

function buildVerdict(result) {
  const attempts = Number(result?.attempts || 0);
  const approved = result?.status === "APPROVED";
  const reviewStatus = result?.reviewStatus || result?.status;

  if (!attempts) {
    return {
      label: "No verdict yet",
      detail: "The Gatekeeper will summarize editorial quality once the first review cycle finishes.",
      className: ""
    };
  }

  if (approved && reviewStatus === "REJECTED_PRESERVED") {
    return {
      label: "Approved campaign retained",
      detail: "A targeted rewrite was rejected, so the previously approved version stayed live.",
      className: "is-approved"
    };
  }

  if (approved && attempts > 1) {
    return {
      label: `Approved on attempt ${attempts}`,
      detail: `The system refined the initial draft through ${attempts - 1} feedback cycle${attempts - 1 === 1 ? "" : "s"} before approval.`,
      className: "is-approved"
    };
  }

  if (approved) {
    return {
      label: "Approved on first pass",
      detail: "The initial draft cleared validation without requiring a rewrite.",
      className: "is-approved"
    };
  }

  return {
    label: `Needs revision after ${attempts} attempt${attempts === 1 ? "" : "s"}`,
    detail: result?.feedback || "The editor identified clarity or factual issues that still need correction.",
    className: "is-rejected"
  };
}

function EmptyPanel({ title, message, hint }) {
  return (
    <div className="war-room-empty">
      <strong>{title}</strong>
      <p>{message}</p>
      {hint ? <span>{hint}</span> : null}
    </div>
  );
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
      <div className="war-agent-card__status">Status: {formatStatus(status)}</div>
    </article>
  );
}

export default function AgentsView({ liveLogs, agentStages, loading, result, hasCampaign, reviewActionState, onArtifactOpen, onSubmitOperatorInput }) {
  const [operatorInput, setOperatorInput] = useState("");
  const ambiguitiesRef = useRef(null);
  const logs = liveLogs.length
    ? liveLogs
    : loading
    ? [{ message: "Pipeline connected. The first live updates will appear as the agents begin processing.", type: "system", timestamp: new Date().toISOString() }]
    : [{ message: "No active campaign. Start a campaign from the Campaigns page to initiate the multi-agent pipeline.", type: "system", timestamp: new Date().toISOString() }];

  const telemetry = result?.telemetry;
  const artifacts = buildArtifacts(result);
  const tasks = buildTasks(result);
  const ambiguities = getAmbiguities(result);
  const verdict = buildVerdict(result);
  const attempts = Number(result?.attempts || 0);

  const diagnostics = {
    pipelineState: loading ? "running" : result?.reviewStatus || result?.status || "standby",
    researchMs: telemetry?.stageTimings?.researcherMs || 0,
    writingMs: telemetry?.stageTimings?.writerMs || 0,
    editingMs: telemetry?.stageTimings?.editorMs || 0,
    totalMs: telemetry?.durationMs || 0
  };
  const aiTelemetry = telemetry?.ai || {};
  const aiAgents = aiTelemetry?.agents || {};
  const aiFallbackUsed = Boolean(aiTelemetry?.fallbackUsed);
  const socialPlatform = normalizeSocialPlatform(result?.source?.socialPlatform);
  const platformReview = telemetry?.platformReview || {};

  const intelligence = {
    features: telemetry?.featureCount || 0,
    audience: telemetry?.audienceCount || 0,
    ambiguities: telemetry?.ambiguityCount || 0
  };

  const pendingGuidance = result?.pendingGuidance || null;
  const lastAppliedGuidance = result?.lastAppliedGuidance || null;
  const rawLatestOperatorNote = Array.isArray(result?.manualInstructions) && result.manualInstructions.length
    ? result.manualInstructions[result.manualInstructions.length - 1]
    : null;
  const latestOperatorNote =
    rawLatestOperatorNote &&
    rawLatestOperatorNote.id !== pendingGuidance?.id &&
    rawLatestOperatorNote.id !== lastAppliedGuidance?.id
      ? rawLatestOperatorNote
      : null;

  const researcherStatus = agentStages.researcher.status;
  const writerStatus = agentStages.writer.status;
  const editorStatus = agentStages.editor.status;
  const activeOperationLabel = reviewActionState?.channel
    ? reviewActionState.channel === "tweets"
      ? `${getSocialPlatformLabel(result?.source?.socialPlatform)} Asset`
      : reviewActionState.channel === "email"
      ? "Email Teaser"
      : "Blog Post"
    : null;

  return (
    <div className="war-room-page">
      <div className="war-room-main">
        <div className="war-room-summary">
          <div className="war-room-summary__eyebrow">Multi-Agent Pipeline</div>
          <h2>Iterative validation with feedback optimization across research, writing, and editorial control.</h2>
          <p>Research &rarr; Write &rarr; Validate &rarr; Refine</p>
          {hasCampaign && intelligence.ambiguities ? (
            <button
              type="button"
              className="war-room-summary__ambiguity-chip"
              onClick={() => ambiguitiesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <span className="material-symbols-outlined">warning</span>
              <span>{intelligence.ambiguities} Ambiguities Detected</span>
            </button>
          ) : null}
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

        {hasCampaign && (reviewActionState || pendingGuidance || lastAppliedGuidance) ? (
          <section className="war-room-operation">
            <div className="war-room-operation__head">
              <div>
                <div className="war-room-operation__eyebrow">Operator Context</div>
                <h3>
                  {reviewActionState?.status === "running"
                    ? `Regenerating ${activeOperationLabel || "selected channel"}`
                    : reviewActionState?.status === "approved"
                    ? `${activeOperationLabel || "Channel"} updated successfully`
                    : reviewActionState?.status === "rejected"
                    ? `${activeOperationLabel || "Channel"} rewrite reviewed`
                    : pendingGuidance
                    ? "Guidance queued for the next rewrite"
                    : "Pipeline ready for operator input"}
                </h3>
              </div>
              {reviewActionState?.status ? (
                <span className={`war-room-operation__status is-${reviewActionState.status}`}>
                  {reviewActionState.status === "running"
                    ? "In Progress"
                    : reviewActionState.status === "approved"
                    ? "Approved"
                    : reviewActionState.status === "rejected"
                    ? "Reviewed"
                    : "Ready"}
                </span>
              ) : null}
            </div>

            <p className="war-room-operation__summary">
              {reviewActionState?.message ||
                (pendingGuidance
                  ? "Your latest guidance is saved and will be applied the next time you regenerate a specific channel."
                  : "Use the guidance field below to steer the next draft or targeted rewrite.")}
            </p>

            <div className="war-room-operation__chips">
              {pendingGuidance ? <span className="is-pending">Pending guidance queued</span> : null}
              {lastAppliedGuidance ? <span className="is-applied">Last guidance applied</span> : null}
              {reviewActionState?.channel ? <span>{activeOperationLabel} in focus</span> : null}
            </div>
          </section>
        ) : null}

        <section className="war-room-stream">
          <div className="war-room-stream__head">
            <div className="war-room-stream__head-title">
              <span className="material-symbols-outlined">forum</span>
              <h3>Collaborative Logic Stream</h3>
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
            <span className="war-room-stream__input-label">{loading ? "Live Guidance:" : "Revision Guidance:"}</span>
            <input
              className="war-room-stream__input-field"
              value={operatorInput}
              onChange={(event) => setOperatorInput(event.target.value)}
              placeholder={loading ? "Enter live operator guidance..." : "Queue guidance for the next targeted rewrite..."}
            />
            <button
              type="button"
              className="war-room-stream__input-button"
              aria-label="Send override"
              disabled={!hasCampaign || !operatorInput.trim()}
              onClick={() => {
                const message = operatorInput.trim();

                if (!message) {
                  return;
                }

                onSubmitOperatorInput?.(message);
                setOperatorInput("");
              }}
            >
              <span className="material-symbols-outlined">terminal</span>
            </button>
          </div>

          {pendingGuidance ? (
            <div className="war-room-stream__operator-note is-pending">
              <span className="material-symbols-outlined">schedule</span>
              <div>
                <strong>Pending revision guidance</strong>
                <p>{pendingGuidance.message}</p>
              </div>
            </div>
          ) : null}

          {lastAppliedGuidance ? (
            <div className="war-room-stream__operator-note is-applied">
              <span className="material-symbols-outlined">check_circle</span>
              <div>
                <strong>Last applied guidance</strong>
                <p>{lastAppliedGuidance.message}</p>
              </div>
            </div>
          ) : null}

          {latestOperatorNote && !pendingGuidance && !lastAppliedGuidance ? (
            <div className="war-room-stream__operator-note">
              <span className="material-symbols-outlined">rule</span>
              <div>
                <strong>Latest operator guidance</strong>
                <p>{latestOperatorNote.message}</p>
              </div>
            </div>
          ) : null}
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
                  <div className="war-room-checklist__item">
                    <span className="war-room-checklist__label">Initial Draft <em>&rarr;</em></span>
                    <strong className={attempts > 1 ? "is-rejected" : "is-approved"}>{attempts > 1 ? "Rejected" : "Approved"}</strong>
                  </div>
                  <div className="war-room-checklist__item">
                    <span className="war-room-checklist__label">Refined Output <em>&rarr;</em></span>
                    <strong className={result?.status === "APPROVED" ? "is-approved" : "is-rejected"}>{formatStatusLabel(result?.status)}</strong>
                  </div>
                  <div className="war-room-checklist__item">
                    <span>Latest Review</span>
                    <strong className={String(result?.reviewStatus || "").includes("REJECTED") ? "is-rejected" : "is-approved"}>
                      {formatStatusLabel(result?.reviewStatus)}
                    </strong>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyPanel
                title="No Iterations Yet"
                message="Refinement cycles will appear here after the first draft is generated."
                hint="Run a campaign to see the draft-to-approval flow."
              />
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
              <EmptyPanel
                title="No Insights Available"
                message="Extraction metrics will appear once the Analytical Brain completes processing."
                hint="Upload or paste content to unlock system intelligence."
              />
            )}
          </section>
        </div>

        <section ref={ambiguitiesRef} className="war-room-ambiguities">
          <div className="war-room-ambiguities__header">
            <div className="war-room-ambiguities__title">
              <span className="material-symbols-outlined">warning</span>
              <h3>Ambiguities Detected {hasCampaign ? `(${ambiguities.length})` : ""}</h3>
            </div>
          </div>
          {hasCampaign && ambiguities.length ? (
            <ul className="war-room-ambiguities__list">
              {ambiguities.slice(0, 6).map((item) => (
                <li key={item}>{capitalizeFirstLetter(item)}</li>
              ))}
            </ul>
          ) : (
            <EmptyPanel
              title="No Ambiguities Surfaced Yet"
              message="This section highlights areas where the source material may be unclear, incomplete, or risky."
              hint="The panel activates after the Analytical Brain finishes extraction."
            />
          )}
        </section>
      </div>

      <aside className="war-room-sidebar">
        <section className="war-room-panel">
          <div className="war-room-panel__header">
            <div>
              <div className="war-room-panel__title">Pipeline Performance</div>
              <div className="war-room-panel__subtitle">Execution Time Breakdown</div>
            </div>
            <button type="button" className="war-room-panel__action" aria-label="Analytics">
              <span className="material-symbols-outlined">analytics</span>
            </button>
          </div>
          <div className="war-room-panel__label-row">
            <span>Pipeline State</span>
            <strong>{formatStatusLabel(diagnostics.pipelineState)}</strong>
          </div>
          <div className="war-room-ai-status">
            <div className={`war-room-ai-status__badge ${aiFallbackUsed ? "is-fallback" : "is-primary"}`}>
              {aiFallbackUsed ? "Fallback Active" : "Primary Provider"}
            </div>
            <small>
              {aiAgents?.researcher?.provider ? `Research: ${aiAgents.researcher.provider}` : "Research provider pending"}
              {aiAgents?.writer?.provider ? ` • Write: ${aiAgents.writer.provider}` : ""}
              {aiAgents?.editor?.provider ? ` • Edit: ${aiAgents.editor.provider}` : ""}
            </small>
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
              <div className="war-room-verdict__platform-meta">
                <span>Platform Fit</span>
                <strong>{getSocialPlatformLabel(socialPlatform)}</strong>
              </div>
              {Array.isArray(platformReview?.violations) && platformReview.violations.length ? (
                <ul className="war-room-verdict__violations">
                  {platformReview.violations.slice(0, 3).map((violation) => (
                    <li key={violation}>{capitalizeFirstLetter(violation)}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <EmptyPanel
              title="No Verdict Yet"
              message="The Gatekeeper summarizes editorial quality and approval readiness here."
              hint="Complete the first review cycle to unlock this panel."
            />
          )}
        </section>

        <section className="war-room-panel">
          <div className="war-room-panel__title">Recent Artifacts</div>
          {artifacts.length ? (
            artifacts.map((artifact) => (
              <button key={artifact.title} type="button" className="war-room-artifact" onClick={() => onArtifactOpen?.(artifact.key)} disabled={!result?.campaignId}>
                <span className={`material-symbols-outlined ${artifact.iconClass}`}>{artifact.icon}</span>
                <div>
                  <strong>{artifact.title}</strong>
                  <small>{artifact.meta}</small>
                </div>
              </button>
            ))
          ) : (
            <EmptyPanel
              title="No Artifacts Yet"
              message="Downloadable campaign assets will appear here after generation completes."
              hint="Run a campaign to create source, content, and preview artifacts."
            />
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
            <EmptyPanel
              title="No Results Yet"
              message="This panel summarizes the downstream outcomes of the current campaign run."
              hint="Run a campaign to generate channel outputs and performance insights."
            />
          )}
        </section>

        <section className="war-room-footer-stats">
          <div>
            <span>Total Run Time</span>
            <strong>{telemetry?.durationMs ? formatDuration(telemetry.durationMs) : "--"}</strong>
          </div>
          <div>
            <span>Event Count</span>
            <strong>{hasCampaign ? String(logs.length).padStart(2, "0") : "--"}</strong>
          </div>
        </section>
      </aside>
    </div>
  );
}
