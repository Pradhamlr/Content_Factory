import { useEffect, useRef, useState } from "react";
import AppSidebar from "./components/AppSidebar";
import AppTopbar from "./components/AppTopbar";
import { api, buildExportFile } from "./lib/api";
import CampaignsView from "./views/CampaignsView";
import AgentsView from "./views/AgentsView";
import PlaceholderView from "./views/PlaceholderView";
import ReviewView from "./views/ReviewView";
import PreviewView from "./views/PreviewView";

const initialAgentStages = {
  researcher: { label: "Analytical Brain", status: "standby" },
  writer: { label: "The Voice", status: "waiting" },
  editor: { label: "The Gatekeeper", status: "idle" }
};

export default function App() {
  const [activeView, setActiveView] = useState("campaigns");
  const [input, setInput] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const [liveLogs, setLiveLogs] = useState([]);
  const [agentStages, setAgentStages] = useState(initialAgentStages);
  const eventSourceRef = useRef(null);
  const hasCampaign = Boolean(requestId) || loading || Boolean(result);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  function resetPipelineState(nextRequestId) {
    setRequestId(nextRequestId);
    setLiveLogs([]);
    setAgentStages(initialAgentStages);
  }

  function appendLog(message, type = "system", timestamp = new Date().toISOString()) {
    setLiveLogs((current) => [...current, { message, type, timestamp }]);
  }

  function connectStream(nextRequestId) {
    eventSourceRef.current?.close();
    const eventSource = new EventSource(`/api/generate/stream?requestId=${nextRequestId}`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener("connected", (event) => {
      const payload = JSON.parse(event.data);
      appendLog(payload.message, "system");
    });

    eventSource.addEventListener("stage", (event) => {
      const payload = JSON.parse(event.data);
      setAgentStages((current) => ({
        ...current,
        [payload.stage]: {
          ...current[payload.stage],
          status: payload.status
        }
      }));
      appendLog(payload.message, payload.stage);
    });

    eventSource.addEventListener("attempt", (event) => {
      const payload = JSON.parse(event.data);
      appendLog(payload.message, "system");
    });

    eventSource.addEventListener("agent-log", (event) => {
      const payload = JSON.parse(event.data);
      appendLog(`${payload.agent}: output captured in telemetry log.`, payload.agent, payload.timestamp);
    });

    eventSource.addEventListener("complete", (event) => {
      const payload = JSON.parse(event.data);
      appendLog(payload.message, "system");
      setTimeout(() => {
        eventSource.close();
      }, 500);
    });
  }

  async function handleGenerate() {
    if (!input.trim()) {
      setError("Please paste source material before generating content.");
      return;
    }

    const nextRequestId = crypto.randomUUID();
    resetPipelineState(nextRequestId);
    connectStream(nextRequestId);
    setLoading(true);
    setError("");
    setActiveView("agents");

    try {
      const payload = await api("/api/generate", {
        method: "POST",
        body: JSON.stringify({ input: input.trim(), requestId: nextRequestId })
      });

      setResult(payload);
      setRequestId(payload.requestId || nextRequestId);
    } catch (nextError) {
      setError(nextError.message);
      setResult(null);
      appendLog(nextError.message, "error");
    } finally {
      setLoading(false);
    }
  }

  function downloadResultJson() {
    if (!result) {
      return;
    }

    buildExportFile(`campaign-result-${requestId || "latest"}.json`, result);
  }

  return (
    <div className="app-frame">
      <AppSidebar activeView={activeView} onChange={setActiveView} />

      <div className="app-main">
        <AppTopbar activeView={activeView} status={result?.status || (loading ? "PROCESSING" : "STANDBY")} requestId={requestId} />

        <main className="app-content">
          {activeView === "campaigns" ? (
            <CampaignsView
              input={input}
              setInput={setInput}
              onGenerate={handleGenerate}
              loading={loading}
              error={error}
              result={result}
            />
          ) : null}

          {activeView === "agents" ? <AgentsView liveLogs={liveLogs} agentStages={agentStages} loading={loading} result={result} hasCampaign={hasCampaign} /> : null}

          {activeView === "analysis" ? (
            <ReviewView input={input} result={result} onExport={downloadResultJson} hasCampaign={hasCampaign} />
          ) : null}

          {activeView === "preview" ? <PreviewView result={result} onExport={downloadResultJson} hasCampaign={hasCampaign} /> : null}

          {activeView === "settings" ? (
            <PlaceholderView title="Settings" description="This view is intentionally deferred while the primary production screens are refined." />
          ) : null}
        </main>
      </div>
    </div>
  );
}
