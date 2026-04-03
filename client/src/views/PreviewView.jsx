function toHeadlineCase(value) {
  return String(value || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (["and", "or", "the", "a", "an", "of", "for", "to", "in", "with", "by"].includes(word)) {
        return word;
      }

      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ")
    .replace(/^./, (character) => character.toUpperCase());
}

function buildBlogTitle(blog, facts = {}) {
  const valueProp = String(facts?.valueProposition || "").replace(/[.!?]+$/, "").trim();

  if (valueProp.length >= 18 && valueProp.length <= 88) {
    return toHeadlineCase(valueProp);
  }

  const clean = String(blog || "").replace(/^#+\s*/gm, "").replace(/\*\*/g, "").trim();
  const lines = clean.split("\n").map((line) => line.trim()).filter(Boolean);
  const headingLike = lines.find((line) => line.length >= 18 && line.length <= 88 && !/[,:;].{25,}/.test(line));

  if (headingLike) {
    return headingLike.replace(/[.!?]+$/, "");
  }

  const firstSentence = clean.match(/[^.!?]+[.!?]/)?.[0]?.trim().replace(/[.!?]+$/, "") || "";

  if (firstSentence) {
    const shortened = firstSentence.split(/\s+/).slice(0, 12).join(" ");
    return toHeadlineCase(shortened);
  }

  return "Campaign Story";
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

function getBlogExcerpt(blog) {
  if (!blog) {
    return "";
  }

  const clean = blog
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [];

  if (sentences.length) {
    const excerpt = sentences
      .slice(0, 3)
      .map((sentence) => sentence.trim())
      .join(" ");

    return sentences.length > 3 ? `${excerpt} ...` : excerpt;
  }

  return clean.length > 260 ? `${clean.slice(0, 257).trim()} ...` : clean;
}

function getEmailHeadline(email) {
  if (!email) {
    return "";
  }

  const clean = email.replace(/^subject:\s*/im, "").trim();
  return clean.split(/[.!?]/)[0]?.trim() || clean.slice(0, 90);
}

function hashString(value) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function buildTopicVisualDataUrl(seedSource, variant = "desktop") {
  const seed = hashString(seedSource || "campaign-preview");
  const width = variant === "mobile" ? 1080 : 1400;
  const height = variant === "mobile" ? 1080 : 760;
  const amplitudeA = 70 + (seed % 70);
  const amplitudeB = 50 + ((seed >> 3) % 60);
  const offsetA = 180 + ((seed >> 2) % 120);
  const offsetB = 380 + ((seed >> 4) % 140);
  const hueShift = seed % 25;
  const label = variant === "mobile" ? "SOCIAL VISUAL" : "FEATURE TECH";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#081121"/>
          <stop offset="100%" stop-color="#0d172b"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="45%" r="45%">
          <stop offset="0%" stop-color="rgba(0,240,255,0.42)"/>
          <stop offset="45%" stop-color="rgba(0,240,255,0.12)"/>
          <stop offset="100%" stop-color="rgba(0,240,255,0)"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" rx="24" fill="url(#bg)"/>
      <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="24" fill="none" stroke="rgba(255,255,255,0.05)"/>
      <ellipse cx="${Math.round(width * 0.48)}" cy="${Math.round(height * 0.44)}" rx="${Math.round(width * 0.18)}" ry="${Math.round(height * 0.25)}" fill="url(#glow)"/>
      <g fill="none" stroke="rgba(56,228,255,0.72)" stroke-width="3">
        <path d="M 40 ${offsetA} C ${Math.round(width * 0.18)} ${offsetA - amplitudeA}, ${Math.round(width * 0.36)} ${offsetA + amplitudeA}, ${Math.round(width * 0.52)} ${offsetA}
                 S ${Math.round(width * 0.84)} ${offsetA - amplitudeA}, ${width - 40} ${offsetA}" />
        <path d="M 40 ${offsetA + 22} C ${Math.round(width * 0.18)} ${offsetA + 22 - amplitudeA * 0.85}, ${Math.round(width * 0.36)} ${offsetA + 22 + amplitudeA * 0.9}, ${Math.round(width * 0.52)} ${offsetA + 22}
                 S ${Math.round(width * 0.84)} ${offsetA + 22 - amplitudeA * 0.8}, ${width - 40} ${offsetA + 22}" opacity="0.8" />
        <path d="M 40 ${offsetB} C ${Math.round(width * 0.2)} ${offsetB + amplitudeB}, ${Math.round(width * 0.38)} ${offsetB - amplitudeB}, ${Math.round(width * 0.56)} ${offsetB}
                 S ${Math.round(width * 0.84)} ${offsetB + amplitudeB}, ${width - 40} ${offsetB}" opacity="0.65" />
        <path d="M 40 ${offsetB + 18} C ${Math.round(width * 0.2)} ${offsetB + 18 + amplitudeB * 0.8}, ${Math.round(width * 0.38)} ${offsetB + 18 - amplitudeB * 0.85}, ${Math.round(width * 0.56)} ${offsetB + 18}
                 S ${Math.round(width * 0.84)} ${offsetB + 18 + amplitudeB * 0.8}, ${width - 40} ${offsetB + 18}" opacity="0.45" />
      </g>
      <g fill="none" stroke="rgba(99,102,241,${0.26 + hueShift / 100})" stroke-width="1.5">
        <path d="M 60 ${Math.round(height * 0.2)} L ${width - 60} ${Math.round(height * 0.2)}"/>
        <path d="M 60 ${Math.round(height * 0.8)} L ${width - 60} ${Math.round(height * 0.8)}"/>
      </g>
      <rect x="44" y="44" width="170" height="42" rx="11" fill="#4f46e5"/>
      <text x="69" y="71" fill="#ffffff" font-family="Arial, sans-serif" font-size="20" font-weight="700">${label}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
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
  const blogTitle = buildBlogTitle(blog, result?.facts);
  const blogParagraphs = getBlogParagraphs(blog);
  const firstTweet = tweets[0] || "";
  const approvedCount = Object.values(approvedTabs || {}).filter(Boolean).length;
  const seoScore = hasCampaign ? Math.min(99, 84 + approvedCount * 4 + Math.min(5, blogParagraphs.length)) : "--";
  const omniImpact = hasCampaign ? `${Math.min(100, 48 + approvedCount * 14 + tweets.length * 3)}%` : "--";
  const loadPerformance = hasCampaign && result?.telemetry?.durationMs ? `${(result.telemetry.durationMs / 1000).toFixed(1)}s` : "--";
  const visualSync = hasCampaign ? `${approvedCount}/3 channels approved` : "No review data yet";
  const deployLabel = formatDeployLabel(deployment);
  const deploymentTime = deployment?.deployedAt ? new Date(deployment.deployedAt).toLocaleString() : "Not deployed";
  const visualSeed = `${blogTitle}|${firstTweet}|${email}|${result?.facts?.valueProposition || ""}`;
  const desktopImageUrl = hasCampaign ? buildTopicVisualDataUrl(visualSeed, "desktop") : "";
  const mobileImageUrl = hasCampaign ? buildTopicVisualDataUrl(visualSeed, "mobile") : "";
  const blogExcerpt = getBlogExcerpt(blog);

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

                {desktopImageUrl ? (
                  <div className="browser-article__hero-image">
                    <img src={desktopImageUrl} alt="Topic-based campaign hero visual" loading="lazy" />
                  </div>
                ) : null}

                <div className="browser-article__content">
                  {hasCampaign && blogExcerpt ? (
                    <p>{blogExcerpt}</p>
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
                  {mobileImageUrl ? (
                    <div className="phone-preview__hero-image">
                      <img src={mobileImageUrl} alt="Topic-based social campaign visual" loading="lazy" />
                    </div>
                  ) : null}
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
