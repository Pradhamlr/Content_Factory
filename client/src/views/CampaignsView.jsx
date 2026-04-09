function formatTimestamp(value) {
  if (!value) {
    return "Just now";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Recently updated";
  }

  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function toHeadlineCase(value) {
  return String(value || "")
    .trim()
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

function PlatformLogo({ platform }) {
  if (platform === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="campaign-platform-selector__logo-svg">
        <path
          fill="currentColor"
          d="M19 3A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3H19ZM8.34 10.14H5.94V18H8.34V10.14ZM7.14 6.3A1.39 1.39 0 0 0 5.76 7.74A1.39 1.39 0 0 0 7.14 9.18A1.4 1.4 0 0 0 8.52 7.74A1.4 1.4 0 0 0 7.14 6.3ZM18.06 13.2C18.06 10.86 16.8 9.78 15.12 9.78C13.77 9.78 13.17 10.53 12.84 11.04V10.14H10.44C10.47 10.74 10.44 18 10.44 18H12.84V13.62C12.84 13.38 12.87 13.14 12.93 12.96C13.14 12.37 13.62 11.76 14.43 11.76C15.48 11.76 15.9 12.57 15.9 13.74V18H18.3L18.06 13.2Z"
        />
      </svg>
    );
  }

  if (platform === "reddit") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="campaign-platform-selector__logo-svg">
        <path
          fill="currentColor"
          d="M18.78 10.36C19.63 10.36 20.32 9.67 20.32 8.82C20.32 7.97 19.63 7.28 18.78 7.28C18.17 7.28 17.65 7.64 17.4 8.15C16.32 7.43 14.95 6.98 13.46 6.91L14.22 3.41L16.66 3.93C16.69 4.6 17.24 5.14 17.92 5.14C18.61 5.14 19.17 4.58 19.17 3.89C19.17 3.2 18.61 2.64 17.92 2.64C17.43 2.64 17.01 2.92 16.8 3.34L13.98 2.74C13.63 2.67 13.29 2.89 13.21 3.24L12.3 6.86C10.75 6.89 9.33 7.34 8.22 8.07C7.98 7.59 7.47 7.28 6.88 7.28C6.03 7.28 5.34 7.97 5.34 8.82C5.34 9.67 6.03 10.36 6.88 10.36C6.95 10.36 7.02 10.35 7.09 10.34C7.04 10.6 7.01 10.88 7.01 11.16C7.01 14.23 9.27 16.72 12.05 16.72C14.83 16.72 17.09 14.23 17.09 11.16C17.09 10.89 17.06 10.62 17.01 10.36C17.58 10.72 18.16 10.36 18.78 10.36ZM9.86 12.36C9.16 12.36 8.59 11.79 8.59 11.09C8.59 10.39 9.16 9.82 9.86 9.82C10.56 9.82 11.13 10.39 11.13 11.09C11.13 11.79 10.56 12.36 9.86 12.36ZM14.28 14.9C13.77 15.41 12.99 15.67 12.05 15.67C11.11 15.67 10.33 15.41 9.82 14.9C9.62 14.7 9.62 14.38 9.82 14.18C10.02 13.98 10.34 13.98 10.54 14.18C10.85 14.49 11.37 14.65 12.05 14.65C12.73 14.65 13.25 14.49 13.56 14.18C13.76 13.98 14.08 13.98 14.28 14.18C14.48 14.38 14.48 14.7 14.28 14.9ZM14.24 12.36C13.54 12.36 12.97 11.79 12.97 11.09C12.97 10.39 13.54 9.82 14.24 9.82C14.94 9.82 15.51 10.39 15.51 11.09C15.51 11.79 14.94 12.36 14.24 12.36Z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="campaign-platform-selector__logo-svg">
      <path
        fill="currentColor"
        d="M18.9 3H21L14.34 10.62L22.18 21H16.03L11.2 14.69L5.68 21H3.58L10.7 12.86L3.18 3H9.49L13.86 8.74L18.9 3ZM18.15 19.72H19.31L8.86 4.21H7.6L18.15 19.72Z"
      />
    </svg>
  );
}

export default function CampaignsView({
  input,
  setInput,
  sourceMode,
  setSourceMode,
  socialPlatform,
  setSocialPlatform,
  selectedFile,
  setSelectedFile,
  onClearSelectedFile,
  pdfReviewOpen,
  pdfReviewDraft,
  setPdfReviewDraft,
  onApplyPdfReview,
  onCancelPdfReview,
  onLoadDemo,
  onGenerate,
  loading,
  savedCampaigns,
  campaignsLoading,
  onLoadCampaign,
  onDeleteCampaign
}) {
  const socialPlatformOptions = [
    {
      value: "twitter",
      label: "X / Twitter",
      hint: "Short, punchy thread designed for virality and engagement.",
      brandClass: "is-x"
    },
    {
      value: "linkedin",
      label: "LinkedIn",
      hint: "Professional insight post optimized for B2B authority building.",
      brandClass: "is-linkedin"
    },
    {
      value: "reddit",
      label: "Reddit",
      hint: "Value-first discussion tone tailored for specific subreddit communities.",
      brandClass: "is-reddit"
    }
  ];

  return (
    <div className="campaigns-page">
      <section className="campaign-hero">
        <div className="campaign-hero__copy">
          <h2>Campaign Assembly</h2>
          <p>Orchestrate your content production with AI. Upload technical documentation to start a new campaign pipeline.</p>
        </div>

        <div className="campaign-uploader">
          <div className="campaign-uploader__icon">
            <span className="material-symbols-outlined" aria-hidden="true">cloud_upload</span>
          </div>
          <h3>Drop Technical Blueprints</h3>
          <p>Support for PDF Whitepapers, Case Study URLs, or Podcast Transcripts.</p>

          <div className="campaign-platform-selector">
            <div className="campaign-platform-selector__heading">
              <h4>Social Platform Target</h4>
              <p>Choose how the social asset should be written and validated.</p>
            </div>
            <div className="campaign-platform-selector__grid">
              {socialPlatformOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`campaign-platform-selector__card ${socialPlatform === option.value ? "is-active" : ""} ${option.brandClass}`}
                  onClick={() => setSocialPlatform(option.value)}
                >
                  <div className={`campaign-platform-selector__logo ${option.brandClass}`}>
                    <PlatformLogo platform={option.value} />
                  </div>
                  <div className="campaign-platform-selector__card-copy">
                    <strong>{option.label}</strong>
                    <span>{option.hint}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="campaign-uploader__chips">
            <label className={`campaign-uploader__chip-button ${sourceMode === "pdf" ? "is-active" : ""}`}>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={async (event) => {
                  const nextFile = event.target.files?.[0] || null;
                  await setSelectedFile(nextFile);
                }}
              />
              <span className="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>
              <span>{selectedFile ? "PDF READY" : "PDF"}</span>
            </label>
            <button
              type="button"
              className={`campaign-uploader__chip-button ${sourceMode === "url" ? "is-active" : ""}`}
              onClick={() => {
                setSelectedFile(null);
                setSourceMode("url");
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true">link</span>
              <span>URL</span>
            </button>
          </div>

          {selectedFile ? (
            <div className="campaign-uploader__file-row">
              <div className="campaign-uploader__file-name">{selectedFile.name}</div>
              <button type="button" className="campaign-uploader__clear-file" onClick={onClearSelectedFile} aria-label="Remove selected PDF">
                <span className="material-symbols-outlined">close_small</span>
              </button>
            </div>
          ) : null}

          <textarea
            value={input}
            onChange={(event) => {
              setSourceMode(sourceMode === "url" ? "url" : sourceMode === "pdf" ? "pdf" : "text");
              setInput(event.target.value);
            }}
            placeholder={sourceMode === "url" ? "Paste an article or product page URL here..." : "Paste source content here, or upload a PDF above..."}
            rows={8}
          />

          <div className="campaign-uploader__actions">
            <button type="button" className="campaign-primary-button" onClick={onGenerate} disabled={loading}>
              <span>{loading ? "Generating..." : "Start Campaign"}</span>
              <small>Upload or paste content to begin pipeline execution</small>
            </button>
            <button
              type="button"
              className="campaign-secondary-button"
              onClick={onLoadDemo}
            >
              <span>Load Demo</span>
              <small>Preview a pre-generated campaign workflow</small>
            </button>
          </div>
        </div>

        <section className="campaign-history">
          <div className="campaign-history__header">
            <div>
              <h3>Saved Campaigns</h3>
            </div>
          </div>

          {campaignsLoading ? (
            <div className="campaign-history__empty">Loading recent campaigns...</div>
          ) : savedCampaigns?.length ? (
            <div className="campaign-history__list">
              {savedCampaigns.map((campaign) => (
                <button
                  key={campaign.campaignId}
                  type="button"
                  className="campaign-history__item"
                  onClick={() => onLoadCampaign(campaign.campaignId)}
                >
                  <div className="campaign-history__item-top">
                    <strong>{toHeadlineCase(campaign.previewTitle)}</strong>
                    <span className={`campaign-history__status is-${String(campaign.reviewStatus || campaign.status || "").toLowerCase()}`}>
                      {campaign.reviewStatus || campaign.status}
                    </span>
                  </div>
                  <div className="campaign-history__meta">
                    <span>
                      {campaign.source?.type?.toUpperCase() || "TEXT"}
                      {campaign.source?.socialPlatform ? ` • ${String(campaign.source.socialPlatform).toUpperCase()}` : ""}
                    </span>
                    <div className="campaign-history__meta-actions">
                      <span>{formatTimestamp(campaign.updatedAt)}</span>
                      <button
                        type="button"
                        className="campaign-history__delete"
                        aria-label="Delete campaign"
                        onClick={(event) => {
                          event.stopPropagation();
                          onDeleteCampaign(campaign.campaignId);
                        }}
                      >
                        <span className="material-symbols-outlined">delete_outline</span>
                      </button>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="campaign-history__empty">
              <strong>No Saved Campaigns</strong>
              <p>Saved campaign runs appear here for quick re-entry into review, preview, and export workflows.</p>
              <span>Start one from text, PDF, or URL.</span>
            </div>
          )}
        </section>
      </section>

      {pdfReviewOpen ? (
        <div className="campaign-modal-backdrop" role="presentation">
          <div className="campaign-modal" role="dialog" aria-modal="true" aria-labelledby="pdf-review-title">
            <div className="campaign-modal__header">
              <div>
                <div className="campaign-modal__eyebrow">PDF Extraction Review</div>
                <h3 id="pdf-review-title">Review extracted text before generation</h3>
                <p>Make quick edits here if the PDF extraction needs cleanup. This reviewed version becomes the campaign source.</p>
              </div>
              <button type="button" className="campaign-modal__close" onClick={onCancelPdfReview} aria-label="Close PDF review">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="campaign-modal__meta">
              <span className="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>
              <span>{selectedFile?.name || "Selected PDF"}</span>
            </div>

            <textarea
              className="campaign-modal__textarea"
              value={pdfReviewDraft}
              onChange={(event) => setPdfReviewDraft(event.target.value)}
              rows={14}
            />

            <div className="campaign-modal__actions">
              <button type="button" className="campaign-modal__secondary" onClick={onCancelPdfReview}>
                Cancel PDF
              </button>
              <button type="button" className="campaign-modal__primary" onClick={onApplyPdfReview} disabled={!pdfReviewDraft.trim()}>
                Use Extracted Text
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
