function getBlogTitle(blog) {
  if (!blog) {
    return "";
  }

  const clean = blog.replace(/^#+\s*/gm, "").replace(/\*\*/g, "").trim();
  const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
  const candidate = lines.find((line) => line.length > 12 && line.length < 90) || "";
  const firstSentence = candidate.split(/[.!?]/)[0]?.trim() || "";
  const title = firstSentence.length >= 18 ? firstSentence : candidate;

  return title.slice(0, 78);
}

function getBlogParagraphs(blog) {
  if (!blog) {
    return [];
  }

  return blog
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*/g, "")
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function getEmailHeadline(email) {
  if (!email) {
    return "";
  }

  const clean = email.replace(/^subject:\s*/im, "").trim();
  return clean.split(/[.!?]/)[0]?.trim() || clean.slice(0, 90);
}

function formatDeployLabel(deployment) {
  if (!deployment?.deployed) {
    return "Waiting for Deployment";
  }

  return `Deployed • ${deployment.deployedChannels.length} channel${deployment.deployedChannels.length === 1 ? "" : "s"}`;
}

export default function PreviewView({
  result,
  onExport,
  onExportKit,
  onDeploy,
  hasCampaign,
  approvedTabs,
  deployment,
  actionLoading,
  error
}) {
  const blog = result?.content?.blog || "";
  const tweets = Array.isArray(result?.content?.tweets) ? result.content.tweets : [];
  const email = result?.content?.email || "";
  const blogTitle = getBlogTitle(blog);
  const blogParagraphs = getBlogParagraphs(blog);
  const firstTweet = tweets[0] || "";
  const approvedCount = Object.values(approvedTabs || {}).filter(Boolean).length;
  const seoScore = hasCampaign ? Math.min(99, 84 + approvedCount * 4 + Math.min(5, blogParagraphs.length)) : "--";
  const omniImpact = hasCampaign ? `${Math.min(100, 48 + approvedCount * 14 + tweets.length * 3)}%` : "--";
  const loadPerformance = hasCampaign && result?.telemetry?.durationMs ? `${(result.telemetry.durationMs / 1000).toFixed(1)}s` : "--";
  const visualSync = hasCampaign ? `${approvedCount}/3 channels approved` : "No review data yet";
  const deployLabel = formatDeployLabel(deployment);
  const deploymentTime = deployment?.deployedAt ? new Date(deployment.deployedAt).toLocaleString() : "Not deployed";

  return (
    <section className="preview-page">
      <div className="preview-page__hero">
        <div>
          <h2>
            Responsive <span>Preview</span>
          </h2>
          <p>{hasCampaign ? "Campaign active - multi-channel validation ready" : "Start a campaign to preview desktop and mobile output"}</p>
        </div>

        <div className="preview-page__hero-actions">
          <button type="button" className="preview-page__secondary" onClick={onExport}>
            <span className="material-symbols-outlined">download</span>
            <span>Export Assets</span>
          </button>
          <button type="button" className="preview-page__primary" onClick={onExportKit}>
            <span className="material-symbols-outlined">package_2</span>
            <span>Export Campaign Kit</span>
          </button>
        </div>
      </div>

      <div className="preview-layout">
        <section className="preview-desktop">
          <div className="preview-section-head">
            <div className="preview-section-head__label">
              <span className="material-symbols-outlined">desktop_windows</span>
              <span>Desktop Blog Post</span>
            </div>
            <div className="preview-section-head__score">SEO Score: {seoScore}</div>
          </div>

          <div className="browser-preview">
            <div className="browser-preview__topbar">
              <div className="browser-preview__lights">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <div className="browser-preview__url">autonomous-factory.ai/blog/live-campaign</div>
            </div>

            <div className="browser-preview__body">
              <article className="browser-article">
                {hasCampaign ? <span className="browser-article__tag">Campaign Story</span> : null}
                <h3>{hasCampaign ? blogTitle || "Desktop preview will appear after generation" : "Desktop preview will appear after generation"}</h3>

                <div className="browser-article__snapshot">
                  <div>
                    <span>Approved</span>
                    <strong>{approvedTabs?.blog ? "Blog approved" : "Review pending"}</strong>
                  </div>
                  <div>
                    <span>Thread ready</span>
                    <strong>{tweets.length ? `${tweets.length} social posts` : "No thread yet"}</strong>
                  </div>
                  <div>
                    <span>Email status</span>
                    <strong>{email ? "Teaser available" : "No teaser yet"}</strong>
                  </div>
                </div>

                <div className="browser-article__content">
                  {hasCampaign && blogParagraphs.length ? (
                    blogParagraphs.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 20)}`}>{paragraph}</p>)
                  ) : (
                    <p>Generated blog content is rendered here once the campaign has been started and approved.</p>
                  )}
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="preview-mobile">
          <div className="preview-section-head">
            <div className="preview-section-head__label">
              <span className="material-symbols-outlined">smartphone</span>
              <span>Social Thread</span>
            </div>
            <div className="preview-section-head__mobile-tag">Mobile</div>
          </div>

          <div className="phone-preview">
            <div className="phone-preview__island"></div>
            <div className="phone-preview__screen">
              <div className="phone-preview__status">
                <span>9:41</span>
                <div>
                  <span className="material-symbols-outlined">signal_cellular_4_bar</span>
                  <span className="material-symbols-outlined">wifi</span>
                  <span className="material-symbols-outlined">battery_full</span>
                </div>
              </div>

              <div className="phone-preview__content">
                <div className="phone-preview__tweet-head">
                  <div className="phone-preview__avatar"></div>
                  <div>
                    <div className="phone-preview__name">
                      <span>Factory Architect</span>
                      <span className="material-symbols-outlined">verified</span>
                    </div>
                    <p>{hasCampaign ? firstTweet || getEmailHeadline(email) : "Social preview becomes available after the first campaign run."}</p>
                  </div>
                </div>

                <div className="phone-preview__content-card">
                  <div className="phone-preview__content-metric">
                    <span>Thread length</span>
                    <strong>{tweets.length || 0} posts</strong>
                  </div>
                  <div className="phone-preview__content-metric">
                    <span>Email teaser</span>
                    <strong>{email ? "Ready" : "Missing"}</strong>
                  </div>
                  <div className="phone-preview__content-metric">
                    <span>Deployment</span>
                    <strong>{deployment?.deployed ? "Live" : "Pending"}</strong>
                  </div>
                </div>

                <div className="phone-preview__actions">
                  <span className="material-symbols-outlined">chat_bubble</span>
                  <span className="material-symbols-outlined">repeat</span>
                  <span className="material-symbols-outlined is-favorite">favorite</span>
                  <span className="material-symbols-outlined">share</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {error ? <div className="preview-page__error">{error}</div> : null}

      <div className="preview-stats">
        <div className="preview-stat">
          <div className="preview-stat__label">
            <span className="material-symbols-outlined">analytics</span>
            <span>Omni-Channel Impact</span>
          </div>
          <strong>{omniImpact}</strong>
          <p>{hasCampaign ? "Derived from approved channels and multi-format output readiness" : "No performance data until a campaign is generated"}</p>
        </div>

        <div className="preview-stat">
          <div className="preview-stat__label">
            <span className="material-symbols-outlined">speed</span>
            <span>Pipeline Runtime</span>
          </div>
          <div className="preview-stat__track">
            <div style={{ width: hasCampaign ? `${Math.min(100, 35 + approvedCount * 18)}%` : "0%" }}></div>
          </div>
          <p>{loadPerformance}</p>
        </div>

        <div className="preview-stat">
          <div className="preview-stat__label">
            <span className="material-symbols-outlined">rule</span>
            <span>Approval State</span>
          </div>
          <strong>{visualSync}</strong>
          <p>{hasCampaign ? `Blog ${approvedTabs?.blog ? "approved" : "pending"}, social ${approvedTabs?.tweets ? "approved" : "pending"}, email ${approvedTabs?.email ? "approved" : "pending"}` : "No approval data yet"}</p>
        </div>

        <div className="preview-stat">
          <div className="preview-stat__label">
            <span className="material-symbols-outlined">cloud_upload</span>
            <span>Deployment</span>
          </div>
          <div className="preview-stat__status">
            <span></span>
            <strong>{deployLabel}</strong>
          </div>
          <p>{deploymentTime}</p>
        </div>
      </div>

      <div className="preview-fab">
        <button type="button" onClick={onDeploy} disabled={!hasCampaign || actionLoading}>
          <span>{actionLoading ? "Deploying..." : "Deploy All Channels"}</span>
          <span className="material-symbols-outlined">send</span>
        </button>
      </div>
    </section>
  );
}
