import { useMemo, useState } from "react";

const demoInput = `PulseOS 4.2 helps marketing teams turn one source document into a coordinated launch package. It supports a research step that extracts factual claims, a writing step that creates a 300 to 500 word blog post, a five-part tweet thread, and a short email teaser, and an editing step that checks hallucinations, tone, and clarity before approval. The workflow is designed for product marketers, content strategists, and marketing operations teams that need faster content repurposing with less inconsistency.`;

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || "Request failed.");
  }

  return payload;
}

function StatCard({ label, value, tone = "default" }) {
  return (
    <div className={`stat-card stat-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ListBlock({ title, items, emptyLabel }) {
  return (
    <section className="content-block">
      <h3>{title}</h3>
      {items?.length ? (
        <ul className="bullet-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">{emptyLabel}</p>
      )}
    </section>
  );
}

export default function App() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("blog");

  const facts = result?.facts;
  const content = result?.content;

  const tabs = useMemo(
    () => [
      { key: "blog", label: "Blog Post" },
      { key: "tweets", label: "Tweet Thread" },
      { key: "email", label: "Email Teaser" }
    ],
    []
  );

  async function handleGenerate(event) {
    event.preventDefault();
    if (!input.trim()) {
      setError("Please paste source material before generating content.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = await api("/api/generate", {
        method: "POST",
        body: JSON.stringify({ input: input.trim() })
      });

      setResult(payload);
      setActiveTab("blog");
    } catch (nextError) {
      setError(nextError.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function copyText(value) {
    const text = Array.isArray(value) ? value.join("\n\n") : value;
    await navigator.clipboard.writeText(text);
  }

  const activeContent = content?.[activeTab];

  return (
    <div className="page-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">AI Content Ops</p>
          <h1>Autonomous Content Factory</h1>
          <p className="hero-copy">
            Paste source material, send it through research, writing, and editorial review, and get structured campaign
            output back from the backend.
          </p>
        </div>
        <div className="hero-chip">Groq backend ready</div>
      </header>

      <main className="layout">
        <section className="panel">
          <div className="panel-head">
            <h2>Source Input</h2>
            <p>This frontend is wired to the new Express + Groq backend at <code>/api/generate</code>.</p>
          </div>

          <form className="campaign-form" onSubmit={handleGenerate}>
            <label>
              Source material
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={14}
                placeholder="Paste product notes, a blog draft, a transcript, or launch messaging here..."
                required
              />
            </label>

            <div className="form-actions">
              <button type="submit" disabled={loading}>
                {loading ? "Generating..." : "Generate Content"}
              </button>
              <button type="button" className="button-secondary" onClick={() => setInput(demoInput)}>
                Load Demo Input
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setInput("");
                  setResult(null);
                  setError("");
                }}
              >
                Reset
              </button>
            </div>
          </form>

          {error ? <p className="error-banner">{error}</p> : null}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Run Summary</h2>
            <p>These values come directly from the backend response and help you validate the AI pipeline quickly.</p>
          </div>

          <div className="stats-grid">
            <StatCard label="Status" value={result?.status || "Idle"} tone={result?.status === "APPROVED" ? "ok" : "default"} />
            <StatCard label="Attempts" value={String(result?.attempts || 0)} />
            <StatCard label="Features" value={String(facts?.features?.length || 0)} />
            <StatCard label="Ambiguities" value={String(facts?.ambiguities?.length || 0)} tone={(facts?.ambiguities?.length || 0) > 0 ? "warn" : "ok"} />
          </div>

          <div className="content-grid">
            <section className="content-panel">
              <h3>Research Output</h3>
              <ListBlock title="Features" items={facts?.features} emptyLabel="No extracted features yet." />
              <ListBlock title="Target Audience" items={facts?.targetAudience} emptyLabel="No target audience yet." />

              <section className="content-block">
                <h3>Value Proposition</h3>
                <p>{facts?.valueProposition || "No value proposition extracted yet."}</p>
              </section>

              <ListBlock title="Ambiguities" items={facts?.ambiguities} emptyLabel="No ambiguities flagged." />
            </section>

            <section className="content-panel">
              <div className="panel-head panel-head-inline">
                <h3>Generated Assets</h3>
                {activeContent ? (
                  <button type="button" className="button-secondary" onClick={() => copyText(activeContent)}>
                    Copy Active Output
                  </button>
                ) : null}
              </div>

              <div className="output-tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`tab-button ${activeTab === tab.key ? "is-active" : ""}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {!content ? (
                <p className="empty-state">Generated blog, tweet thread, and email teaser will appear here.</p>
              ) : activeTab === "tweets" ? (
                <ol className="tweet-list">
                  {content.tweets.map((tweet) => (
                    <li key={tweet}>{tweet}</li>
                  ))}
                </ol>
              ) : (
                <div className="rich-output">
                  <p>{content[activeTab]}</p>
                </div>
              )}

              <section className="content-block feedback-block">
                <h3>Editor Feedback</h3>
                <p>{result?.feedback || "No editor feedback yet."}</p>
              </section>
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
