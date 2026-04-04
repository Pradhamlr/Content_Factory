import { useMemo, useState } from "react";

const tabConfig = [
  {
    key: "blog",
    label: "Blog Post",
    summary: "Long-form editorial review with structure, positioning, and article flow."
  },
  {
    key: "tweets",
    label: "Social Thread",
    summary: "Thread-by-thread review for clarity, punch, and narrative pacing."
  },
  {
    key: "email",
    label: "Email Teaser",
    summary: "Compact email preview focused on subject line, preview text, and CTA."
  }
];

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

function buildBlogTitle(blog = "", facts = {}) {
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
    return toHeadlineCase(firstSentence.split(/\s+/).slice(0, 12).join(" "));
  }

  return "Campaign Story";
}

function getBlogParts(blog = "", facts = {}) {
  const paragraphs = blog.split(/\n\s*\n/).map((item) => item.trim()).filter(Boolean);

  if (!paragraphs.length) {
    return { title: "No blog title generated yet", intro: "", body: [] };
  }

  const title = buildBlogTitle(blog, facts);
  const intro = paragraphs[0] || "";
  const bodyStartIndex = intro && paragraphs[1] ? 1 : 1;
  const body = paragraphs.slice(bodyStartIndex);

  return { title, intro, body };
}

function getEmailParts(email = "") {
  const lines = email
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const subjectLine = lines.find((line) => /^subject:/i.test(line)) || "";
  const bodyLines = lines.filter((line) => line !== subjectLine);

  if (subjectLine) {
    const previewLine = bodyLines[0] || "";
    const body = bodyLines.slice(1);

    return {
      subject: subjectLine.replace(/^subject:\s*/i, "") || "Campaign update",
      preview: previewLine,
      body
    };
  }

  const normalizedBody = bodyLines
    .join(" ")
    .replace(/\[name\]/gi, "")
    .replace(/\[cta[^\]]*\]/gi, "")
    .replace(/dear\s*,?/gi, "")
    .replace(/dear\s+[a-z\s]+,?/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const sentences =
    normalizedBody.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((item) => item.trim()).filter(Boolean) || [];

  const firstSentence = sentences[0] || "";
  const secondSentence = sentences[1] || "";
  const firstClause = firstSentence.split(/[:,-]/)[0]?.trim() || firstSentence;
  const compactSubject = firstClause.split(/\s+/).slice(0, 8).join(" ").replace(/[.!?]+$/, "").trim();
  const subject = compactSubject.length >= 12 ? compactSubject : "Campaign update";
  const preview = secondSentence || firstSentence;
  const bodySource = sentences.slice(1).length ? sentences.slice(1) : sentences.slice(0, 3);
  const body = bodySource.reduce((chunks, sentence, index) => {
    if (index % 2 === 0) {
      chunks.push(sentence);
    } else {
      chunks[chunks.length - 1] = `${chunks[chunks.length - 1]} ${sentence}`.trim();
    }

    return chunks;
  }, []);

  return {
    subject,
    preview,
    body
  };
}

function EmptyReviewState() {
  return <div className="review-empty">Generated content will appear here after the campaign finishes.</div>;
}

function BlogReview({ blog, facts }) {
  const { title, intro, body } = getBlogParts(blog, facts);

  if (!blog) {
    return <EmptyReviewState />;
  }

  return (
    <article className="review-format review-format--blog">
      <header className="review-format__header">
        <div className="review-format__meta">
          <span className="review-format__chip">Editorial Review</span>
          <span className="review-format__eyebrow">Long Form</span>
        </div>
        <div className="review-blog-shell">
          <div className="review-blog-shell__label">Draft Title</div>
          <div className="review-blog-shell__title">{title}</div>
        </div>
      </header>

      <section className="review-blog-panel">
        <div className="review-blog-panel__label">Generated Body Content</div>
        <div className="review-blog-panel__content">
          {intro ? <p className="review-blog-panel__intro">{intro}</p> : null}
          {body.length ? body.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>) : null}
          {!intro && !body.length ? <EmptyReviewState /> : null}
        </div>
      </section>
    </article>
  );
}

function SocialReview({ tweets }) {
  if (!tweets?.length) {
    return <EmptyReviewState />;
  }

  return (
    <section className="review-format review-format--social">
      <header className="review-format__header">
        <div className="review-format__meta">
          <span className="review-format__chip">Thread Review</span>
          <span className="review-format__eyebrow">{tweets.length} Posts</span>
        </div>
        <h1>Social Thread Narrative Pack</h1>
        <p className="review-format__lead">Review each post as an individual social unit while keeping the full thread progression readable.</p>
      </header>

      <div className="review-social-list">
        {tweets.map((tweet, index) => (
          <article key={`${index}-${tweet.slice(0, 20)}`} className="review-social-card">
            <div className="review-social-card__top">
              <div className="review-social-card__author">
                <div className="review-social-card__avatar"></div>
                <div>
                  <strong>Factory Architect</strong>
                  <span>@contentfactory</span>
                </div>
              </div>
              <div className="review-social-card__count">{index + 1}/{tweets.length}</div>
            </div>
            <p>{tweet}</p>
            <div className="review-social-card__actions">
              <span className="material-symbols-outlined">chat_bubble</span>
              <span className="material-symbols-outlined">repeat</span>
              <span className="material-symbols-outlined">favorite</span>
              <span className="material-symbols-outlined">share</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function EmailReview({ email }) {
  const { subject, preview, body } = getEmailParts(email);

  if (!email) {
    return <EmptyReviewState />;
  }

  return (
    <article className="review-format review-format--email">
      <header className="review-format__header">
        <div className="review-format__meta">
          <span className="review-format__chip">Email Review</span>
          <span className="review-format__eyebrow">Inbox Preview</span>
        </div>
        <h1>{subject}</h1>
        {preview ? <p className="review-format__lead">{preview}</p> : null}
      </header>

      <div className="review-email-card">
        <div className="review-email-card__bar">
          <div className="review-email-card__sender">
            <strong>Autonomous Content Factory</strong>
            <span>marketing@contentfactory.ai</span>
          </div>
          <div className="review-email-card__status">Ready to Send</div>
        </div>

        <div className="review-email-card__body">
          {body.length
            ? body.map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>)
            : <p>{preview}</p>}
        </div>

        <div className="review-email-card__cta">
          <button type="button">Explore The Campaign</button>
        </div>
      </div>
    </article>
  );
}

export default function ReviewView({
  input,
  result,
  onExport,
  hasCampaign,
  approvedTabs,
  onApproveChannel,
  onRegenerateChannel,
  actionLoading,
  actionState
}) {
  const [activeTab, setActiveTab] = useState("blog");
  const [historyOpen, setHistoryOpen] = useState(false);

  const sourceText = hasCampaign ? input?.trim() || "" : "";
  const content = result?.content || {};
  const reviewStatus = result?.reviewStatus || result?.status;
  const isRejected = reviewStatus === "REJECTED";
  const isApprovedRun = reviewStatus === "APPROVED";
  const approvedCount = Object.values(approvedTabs || {}).filter(Boolean).length;
  const qualityScore = !hasCampaign ? "--" : isRejected ? "--" : String(84 + approvedCount * 4);
  const activeMeta = tabConfig.find((tab) => tab.key === activeTab) || tabConfig[0];
  const isApproved = Boolean(approvedTabs?.[activeTab]);
  const activeRevisions = Array.isArray(result?.revisionHistory?.[activeTab]) ? [...result.revisionHistory[activeTab]].reverse() : [];

  const contentPanel = useMemo(() => {
    if (!hasCampaign) {
      return <EmptyReviewState />;
    }

    if (activeTab === "tweets") {
      return <SocialReview tweets={Array.isArray(content.tweets) ? content.tweets : []} />;
    }

    if (activeTab === "email") {
      return <EmailReview email={content.email || ""} />;
    }

    return <BlogReview blog={content.blog || ""} facts={result?.facts || {}} />;
  }, [activeTab, content.blog, content.email, content.tweets, hasCampaign, result?.facts]);

  return (
    <section className="review-page">
      <div className="review-page__header">
        <div className="review-page__eyebrow">REVIEWING: AMS_CAMPAIGN_Q4</div>
        <div className="review-page__actions">
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
            <div className="review-content__tab-group">
              <div className="review-content__tab-list">
                {tabConfig.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`review-content__tab ${activeTab === tab.key ? "is-active" : ""}`}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setHistoryOpen(false);
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <p className="review-content__tab-summary">{activeMeta.summary}</p>
            </div>

            <div className="review-content__score">
              <span>Quality Score</span>
              <strong>{qualityScore}</strong>
            </div>
          </div>

          <div className="review-content__body">{contentPanel}</div>

          <section className={`review-history ${historyOpen ? "is-open" : ""}`}>
            <button type="button" className="review-history__toggle" onClick={() => setHistoryOpen((current) => !current)}>
              <div className="review-history__header">
                <h3>Revision History</h3>
                <span>{activeRevisions.length ? `${activeRevisions.length} revision${activeRevisions.length === 1 ? "" : "s"}` : "No revisions yet"}</span>
              </div>
              <span className="material-symbols-outlined">{historyOpen ? "expand_less" : "expand_more"}</span>
            </button>
            {historyOpen ? (
              activeRevisions.length ? (
                <div className="review-history__list">
                  {activeRevisions.map((entry) => (
                    <article key={entry.id} className="review-history__item">
                      <div className="review-history__item-top">
                        <strong>{entry.reviewStatus || "PENDING"}</strong>
                        <span>{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : "Unknown time"}</span>
                      </div>
                      <div className="review-history__item-meta">
                        <span>Campaign: {entry.campaignStatus || "--"}</span>
                        <span>{entry.preservedPrevious ? "Previous approved version retained" : "New draft evaluated"}</span>
                      </div>
                      {entry.feedback ? <p>{entry.feedback}</p> : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="review-empty review-empty--compact">This channel has not been revised yet. Regenerations will appear here as a traceable review timeline.</div>
              )
            ) : null}
          </section>

          <div className="review-content__footer">
            <div className="review-content__footer-actions">
              {!isApproved ? (
              <button
                type="button"
                className={`review-content__secondary ${isRejected ? "is-muted" : ""}`}
                onClick={() => onRegenerateChannel(activeTab)}
                disabled={!hasCampaign || actionLoading || isRejected}
              >
                <span className="material-symbols-outlined">refresh</span>
                <span>{actionLoading ? "Regenerating..." : `Regenerate ${activeMeta.label}`}</span>
              </button>
              ) : null}
              <button
                type="button"
                className={`review-content__primary ${isApproved ? "is-approved" : ""} ${isRejected ? "is-muted" : ""}`}
                onClick={() => onApproveChannel(activeTab)}
                disabled={!hasCampaign || isApproved || isRejected}
              >
                <span className="material-symbols-outlined">check_circle</span>
                <span>{isApproved ? `${activeMeta.label} Approved` : "Approve Content"}</span>
              </button>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
