const demoInput = `PulseOS 4.2 helps marketing teams turn one source document into a coordinated launch package. It supports a research step that extracts factual claims, a writing step that creates a 400 to 500 word blog post, a five-part tweet thread, and a short email teaser, and an editing step that checks hallucinations, tone, and clarity before approval. The workflow is designed for product marketers, content strategists, and marketing operations teams that need faster content repurposing with less inconsistency.`;

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

export default function CampaignsView({
  input,
  setInput,
  sourceMode,
  setSourceMode,
  selectedFile,
  setSelectedFile,
  onClearSelectedFile,
  onGenerate,
  loading,
  savedCampaigns,
  campaignsLoading,
  onLoadCampaign,
  onDeleteCampaign
}) {
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
            <span><span className="material-symbols-outlined" aria-hidden="true">mic</span>AUDIO</span>
          </div>

          {selectedFile ? (
            <div className="campaign-uploader__file-row">
              <div className="campaign-uploader__file-name">{selectedFile.name}</div>
              <button type="button" className="campaign-uploader__clear-file" onClick={onClearSelectedFile} aria-label="Remove selected PDF">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          ) : null}

          <textarea
            value={input}
            onChange={(event) => {
              setSourceMode(sourceMode === "url" ? "url" : "text");
              setInput(event.target.value);
            }}
            placeholder={sourceMode === "url" ? "Paste an article or product page URL here..." : "Paste source content here, or upload a PDF above..."}
            rows={8}
          />

          <div className="campaign-uploader__actions">
            <button type="button" className="campaign-primary-button" onClick={onGenerate} disabled={loading}>
              {loading ? "Generating..." : "Start Campaign"}
            </button>
            <button
              type="button"
              className="campaign-secondary-button"
              onClick={() => {
                setSourceMode("text");
                setInput(demoInput);
                setSelectedFile(null);
              }}
            >
              Load Demo
            </button>
          </div>
        </div>

        <section className="campaign-history">
          <div className="campaign-history__header">
            <div>
              <h3>Saved Campaigns</h3>
              <p>Resume previous runs from your Supabase-backed campaign store.</p>
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
                    <strong>{campaign.previewTitle}</strong>
                    <span className={`campaign-history__status is-${String(campaign.reviewStatus || campaign.status || "").toLowerCase()}`}>
                      {campaign.reviewStatus || campaign.status}
                    </span>
                  </div>
                  <div className="campaign-history__meta">
                    <span>{campaign.source?.type?.toUpperCase() || "TEXT"}</span>
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
                        <span className="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="campaign-history__empty">No saved campaigns yet. Start one from text, PDF, or URL.</div>
          )}
        </section>
      </section>
    </div>
  );
}
