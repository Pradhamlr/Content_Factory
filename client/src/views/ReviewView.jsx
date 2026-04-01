import { useMemo, useState } from "react";

const tabConfig = [
  { key: "blog", label: "Blog Post" },
  { key: "tweets", label: "Social Thread" },
  { key: "email", label: "Email Teaser" }
];

export default function ReviewView({ input, result, onExport, hasCampaign }) {
  const [activeTab, setActiveTab] = useState("blog");

  const sourceText = hasCampaign ? input?.trim() || "" : "";
  const content = result?.content;
  const qualityScore = !hasCampaign ? "--" : result?.status === "APPROVED" ? "98" : "84";

  const tabContent = useMemo(() => {
    if (!hasCampaign) {
      return [];
    }

    if (activeTab === "tweets") {
      const tweets = Array.isArray(content?.tweets) ? content.tweets : [];

      return tweets.map((tweet) => <p key={tweet}>{tweet}</p>);
    }

    if (activeTab === "email") {
      return content?.email ? <p>{content.email}</p> : [];
    }

    const blog = content?.blog || "";

    return blog.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>);
  }, [activeTab, content, hasCampaign]);

  return (
    <section className="review-page">
      <div className="review-page__header">
        <div className="review-page__eyebrow">REVIEWING: AMS_CAMPAIGN_Q4</div>
        <div className="review-page__actions">
          <button type="button" className="review-page__icon-button" aria-label="Notifications">
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <button type="button" className="review-page__icon-button" aria-label="Energy">
            <span className="material-symbols-outlined">bolt</span>
          </button>
          <button type="button" className="review-page__export" onClick={onExport}>
            <span className="material-symbols-outlined">download</span>
            <span>Export Assets</span>
          </button>
        </div>
      </div>

      <div className="review-layout">
        <section className="review-source">
          <div className="review-source__header">
            <div className="review-source__title-group">
              <span className="material-symbols-outlined">description</span>
              <div>
                <h2>ORIGINAL_SOURCE.doc</h2>
                <p>Reference Material</p>
              </div>
            </div>
            <div className="review-source__badge">Read-Only</div>
          </div>

          <div className="review-source__body">
            {hasCampaign ? (
              <>
                {sourceText.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => (
                  <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
                ))}

                <div className="review-source__endcap">
                  <span></span>
                  <em>End of Analysis</em>
                  <span></span>
                </div>
              </>
            ) : (
              <div className="review-empty">Paste source content and start a campaign to unlock the final review workspace.</div>
            )}
          </div>
        </section>

        <section className="review-content">
          <div className="review-content__tabs">
            <div className="review-content__tab-list">
              {tabConfig.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`review-content__tab ${activeTab === tab.key ? "is-active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="review-content__score">
              <span>Quality Score</span>
              <strong>{qualityScore}</strong>
            </div>
          </div>

          <div className="review-content__body">
            <article className="review-article">
              <header className="review-article__header">
                <div className="review-article__meta">
                  {hasCampaign ? <span className="review-article__chip">SEO: Optimal</span> : null}
                  {hasCampaign ? <span className="review-article__persona">Persona: CTO</span> : null}
                </div>
                <h1>
                  {!hasCampaign
                    ? "No campaign content available yet"
                    : activeTab === "blog"
                    ? "Blog Post Review"
                    : activeTab === "tweets"
                    ? "Social Narrative Pack"
                    : "Email Teaser Review"}
                </h1>
              </header>

              <div className="review-article__media"></div>

              <div className="review-article__prose">
                {hasCampaign && tabContent.length ? tabContent : <div className="review-empty">Generated content will appear here after the campaign finishes.</div>}
              </div>
            </article>
          </div>

          <div className="review-content__footer">
            <div className="review-content__footer-tools">
              <button type="button" className="review-content__tool">
                <span className="material-symbols-outlined">edit</span>
              </button>
              <button type="button" className="review-content__tool">
                <span className="material-symbols-outlined">history</span>
              </button>
            </div>

            <div className="review-content__footer-actions">
              <button type="button" className="review-content__secondary">
                <span className="material-symbols-outlined">refresh</span>
                <span>Regenerate</span>
              </button>
              <button type="button" className="review-content__primary">
                <span className="material-symbols-outlined">check_circle</span>
                <span>Approve Content</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
