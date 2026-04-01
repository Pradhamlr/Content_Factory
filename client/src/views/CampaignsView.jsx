const demoInput = `PulseOS 4.2 helps marketing teams turn one source document into a coordinated launch package. It supports a research step that extracts factual claims, a writing step that creates a 400 to 500 word blog post, a five-part tweet thread, and a short email teaser, and an editing step that checks hallucinations, tone, and clarity before approval. The workflow is designed for product marketers, content strategists, and marketing operations teams that need faster content repurposing with less inconsistency.`;

export default function CampaignsView({ input, setInput, onGenerate, loading, error, result }) {
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
            <span><span className="material-symbols-outlined" aria-hidden="true">picture_as_pdf</span>PDF</span>
            <span><span className="material-symbols-outlined" aria-hidden="true">link</span>URL</span>
            <span><span className="material-symbols-outlined" aria-hidden="true">mic</span>AUDIO</span>
          </div>

          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Paste source content here..."
            rows={8}
          />

          <div className="campaign-uploader__actions">
            <button type="button" className="campaign-primary-button" onClick={onGenerate} disabled={loading}>
              {loading ? "Generating..." : "Start Campaign"}
            </button>
            <button type="button" className="campaign-secondary-button" onClick={() => setInput(demoInput)}>
              Load Demo
            </button>
          </div>
        </div>

        {error ? <div className="campaign-error">{error}</div> : null}
      </section>
    </div>
  );
}
