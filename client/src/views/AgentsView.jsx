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
      <div className="war-agent-card__status">STATUS: {status}</div>
    </article>
  );
}

export default function AgentsView({ liveLogs, agentStages, loading, result, hasCampaign }) {
  const logs = liveLogs.length
    ? liveLogs
      : loading
      ? [{ message: "War room stream connected. Waiting for first event...", type: "system", timestamp: new Date().toISOString() }]
      : [{ message: "Awaiting campaign generation. Start from the Campaigns page to populate the collaborative core.", type: "system", timestamp: new Date().toISOString() }];

  const hasArtifacts = Boolean(result?.content);
  const contextUsage = result?.content?.tweets?.length ? Math.min(100, 45 + result.content.tweets.length * 8) : 0;
  const artifacts = hasArtifacts
    ? [
        { icon: "description", iconClass: "is-cyan", title: "Blog_Draft_v1.md", meta: "Generated from approved copy" },
        { icon: "fact_check", iconClass: "is-green", title: "Compliance_Report.json", meta: result?.status || "Ready" }
      ]
    : [];

  const researcherStatus = agentStages.researcher.status;
  const writerStatus = agentStages.writer.status;
  const editorStatus = agentStages.editor.status;

  return (
    <div className="war-room-page">
      <div className="war-room-main">
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
      </div>

      <aside className="war-room-sidebar">
        <section className="war-room-panel">
          <div className="war-room-panel__header">
            <div>
              <div className="war-room-panel__title">System Diagnostics</div>
              <div className="war-room-panel__subtitle">ANALYSIS ACTIVE</div>
            </div>
            <button type="button" className="war-room-panel__action" aria-label="Analytics">
              <span className="material-symbols-outlined">analytics</span>
            </button>
          </div>
          <div className="war-room-panel__label-row">
            <span>Node Latency</span>
            <strong>{hasCampaign ? "Active" : "--"}</strong>
          </div>
          <div className="war-room-meter">
            <div className="war-room-meter__row">
              <span>Inference Core</span>
              <strong>{hasCampaign ? `${Math.max(8, liveLogs.length * 3)}ms` : "--"}</strong>
            </div>
            <div className="war-room-meter__track"><div style={{ width: hasCampaign ? `${Math.min(100, Math.max(12, liveLogs.length * 8))}%` : "0%" }}></div></div>
          </div>
          <div className="war-room-meter">
            <div className="war-room-meter__row">
              <span>Context Window</span>
              <strong>{hasCampaign ? `${contextUsage}% Full` : "--"}</strong>
            </div>
            <div className="war-room-meter__track is-green"><div style={{ width: hasCampaign ? `${contextUsage}%` : "0%" }}></div></div>
          </div>
        </section>

        <section className="war-room-panel">
          <div className="war-room-panel__title">Recent Artifacts</div>
          {artifacts.length ? artifacts.map((artifact) => (
            <div key={artifact.title} className="war-room-artifact">
              <span className={`material-symbols-outlined ${artifact.iconClass}`}>{artifact.icon}</span>
              <div>
                <strong>{artifact.title}</strong>
                <small>{artifact.meta}</small>
              </div>
            </div>
          )) : (
            <div className="war-room-empty">Artifacts will appear after a campaign run completes.</div>
          )}
        </section>

        <section className="war-room-panel war-room-panel--accent">
          <div className="war-room-panel__title">Upcoming Tasks</div>
          {hasCampaign ? (
            <ul>
              <li>{result?.content?.tweets?.length ? "Social pack ready for review" : "Social pack generation queued"}</li>
              <li>{result?.content?.email ? "Email teaser available for approval" : "Email teaser awaiting copy"}</li>
            </ul>
          ) : (
            <div className="war-room-empty">No downstream tasks until a campaign starts.</div>
          )}
        </section>

        <section className="war-room-footer-stats">
          <div>
            <span>GLOBAL UPTIME</span>
            <strong>{hasCampaign ? "Run Active" : "--"}</strong>
          </div>
          <div>
            <span>ACTIVE THREADS</span>
            <strong>{hasCampaign ? String(logs.length).padStart(2, "0") : "--"}</strong>
          </div>
        </section>
      </aside>
    </div>
  );
}
