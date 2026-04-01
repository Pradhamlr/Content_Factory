function getBlogTitle(blog) {
  if (!blog) {
    return "";
  }

  const [firstLine] = blog.split("\n").filter(Boolean);
  return firstLine?.slice(0, 72) || "";
}

function getBlogExcerpt(blog) {
  if (!blog) {
    return "";
  }

  const text = blog.replace(/\s+/g, " ").trim();
  return text.slice(0, 150) + (text.length > 150 ? "..." : "");
}

export default function PreviewView({ result, onExport, hasCampaign }) {
  const blog = result?.content?.blog || "";
  const tweets = Array.isArray(result?.content?.tweets) ? result.content.tweets : [];
  const firstTweet = tweets[0] || "";
  const seoScore = hasCampaign ? Math.min(99, 90 + Math.min(5, tweets.length)) : "--";
  const omniImpact = hasCampaign ? `${Math.min(99, 82 + tweets.length * 2)}%` : "--";
  const loadPerformance = hasCampaign ? `${Math.max(0.8, 1.4 - tweets.length * 0.1).toFixed(1)}s` : "--";
  const visualSync = hasCampaign ? "System Token Sync: 100%" : "Visual system data not available yet";
  const loadTrackWidth = hasCampaign ? `${Math.min(100, 78 + tweets.length * 4)}%` : "0%";

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
          <button type="button" className="preview-page__primary" onClick={onExport}>
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
              <div className="browser-preview__url">autonomous-factory.ai/blog/neon-pulse</div>
            </div>

            <div className="browser-preview__body">
              <article className="browser-article">
                {hasCampaign ? <span className="browser-article__tag">Future Tech</span> : null}
                <h3>{hasCampaign ? getBlogTitle(blog) : "Desktop preview will appear after generation"}</h3>
                <div className="browser-article__image"></div>
                <p>{hasCampaign ? getBlogExcerpt(blog) : "Generated blog content is rendered here once the campaign has been started and approved."}</p>
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
                    <p>{hasCampaign ? firstTweet : "Social preview becomes available after the first campaign run."}</p>
                  </div>
                </div>

                <div className="phone-preview__image"></div>

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

      <div className="preview-stats">
        <div className="preview-stat">
          <div className="preview-stat__label">
            <span className="material-symbols-outlined">analytics</span>
            <span>Omni-Channel Impact</span>
          </div>
          <strong>{hasCampaign ? <>{omniImpact} <em>+5.2%</em></> : "--"}</strong>
          <p>{hasCampaign ? "Optimized for cross-device consistency" : "No performance data until a campaign is generated"}</p>
        </div>

        <div className="preview-stat">
          <div className="preview-stat__label">
            <span className="material-symbols-outlined">speed</span>
            <span>Load Performance</span>
          </div>
          <div className="preview-stat__track">
            <div style={{ width: loadTrackWidth }}></div>
          </div>
          <p>{loadPerformance}</p>
        </div>

        <div className="preview-stat">
          <div className="preview-stat__label">
            <span className="material-symbols-outlined">palette</span>
            <span>Visual Alignment</span>
          </div>
          <div className="preview-stat__swatches">
            <span></span>
            <span></span>
            <span></span>
            <span></span>
          </div>
          <p>{visualSync}</p>
        </div>

        <div className="preview-stat">
          <div className="preview-stat__label">
            <span className="material-symbols-outlined">sync_saved_locally</span>
            <span>Live Status</span>
          </div>
          <div className="preview-stat__status">
            <span></span>
            <strong>{hasCampaign ? "Waiting for Deployment" : "Idle"}</strong>
          </div>
        </div>
      </div>

      <div className="preview-fab">
        <button type="button" onClick={onExport}>
          <span>Deploy All Channels</span>
          <span className="material-symbols-outlined">send</span>
        </button>
      </div>
    </section>
  );
}
