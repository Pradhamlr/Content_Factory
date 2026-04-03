import { useEffect, useRef, useState } from "react";
import AppSidebar from "./components/AppSidebar";
import AppTopbar from "./components/AppTopbar";
import { api, apiForm, buildCampaignKitFile, buildExportFile } from "./lib/api";
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
  const [selectedFile, setSelectedFile] = useState(null);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState("");
  const [liveLogs, setLiveLogs] = useState([]);
  const [agentStages, setAgentStages] = useState(initialAgentStages);
  const [approvedTabs, setApprovedTabs] = useState({
    blog: false,
    tweets: false,
    email: false
  });
  const [reviewActionLoading, setReviewActionLoading] = useState(false);
  const [deployment, setDeployment] = useState({
    deployed: false,
    deployedAt: null,
    deployedChannels: []
  });
  const [previewActionLoading, setPreviewActionLoading] = useState(false);
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
    setApprovedTabs({
      blog: false,
      tweets: false,
      email: false
    });
    setDeployment({
      deployed: false,
      deployedAt: null,
      deployedChannels: []
    });
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
    if (!input.trim() && !selectedFile) {
      setError("Please paste source material or upload a PDF before generating content.");
      return;
    }

    const nextRequestId = crypto.randomUUID();
    resetPipelineState(nextRequestId);
    connectStream(nextRequestId);
    setLoading(true);
    setError("");
    setActiveView("agents");

    try {
      let payload;

      if (selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("requestId", nextRequestId);
        payload = await apiForm("/api/generate/upload", formData);
        setInput(payload.extractedText || input);
      } else {
        payload = await api("/api/generate", {
          method: "POST",
          body: JSON.stringify({ input: input.trim(), requestId: nextRequestId })
        });
      }

      setResult(payload);
      setRequestId(payload.requestId || nextRequestId);
      setApprovedTabs(payload.approvals || {
        blog: false,
        tweets: false,
        email: false
      });
      setDeployment(payload.deployment || {
        deployed: false,
        deployedAt: null,
        deployedChannels: []
      });
    } catch (nextError) {
      setError(nextError.message);
      setResult(null);
      appendLog(nextError.message, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handlePdfSelect(file) {
    setSelectedFile(file);

    if (!file) {
      return;
    }

    setExtractingPdf(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const payload = await apiForm("/api/generate/extract-pdf", formData);
      setInput(payload.extractedText || "");
    } catch (nextError) {
      setSelectedFile(null);
      setInput("");
      setError(nextError.message);
    } finally {
      setExtractingPdf(false);
    }
  }

  function downloadResultJson() {
    if (!result) {
      return;
    }

    buildExportFile(`campaign-result-${requestId || "latest"}.json`, result);
  }

  async function handleRegenerateChannel(channel) {
    if (!result?.facts || !result?.content || reviewActionLoading) {
      return;
    }

    setReviewActionLoading(true);
    setError("");

    try {
      const payload = await api("/api/generate/regenerate", {
        method: "POST",
        body: JSON.stringify({
          requestId,
          channel,
          facts: result.facts,
          currentContent: result.content
        })
      });

      setResult((current) => ({
        ...current,
        content: payload.content,
        status: payload.status === "APPROVED" ? "APPROVED" : current?.status || "REJECTED",
        feedback: payload.feedback || current?.feedback || ""
      }));

      setApprovedTabs(payload.approvals || {
        blog: false,
        tweets: false,
        email: false
      });
      setDeployment(payload.deployment || {
        deployed: false,
        deployedAt: null,
        deployedChannels: []
      });
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setReviewActionLoading(false);
    }
  }

  async function handleApproveChannel(channel) {
    if (!requestId) {
      return;
    }

    setError("");

    try {
      const payload = await api("/api/generate/approve", {
        method: "POST",
        body: JSON.stringify({
          requestId,
          channel
        })
      });

      setApprovedTabs(payload.approvals || {
        blog: false,
        tweets: false,
        email: false
      });
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function handleDeployCampaign() {
    if (!requestId || previewActionLoading) {
      return;
    }

    setPreviewActionLoading(true);
    setError("");

    try {
      const payload = await api("/api/generate/deploy", {
        method: "POST",
        body: JSON.stringify({ requestId })
      });

      setDeployment(payload.deployment || {
        deployed: false,
        deployedAt: null,
        deployedChannels: []
      });
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setPreviewActionLoading(false);
    }
  }

  function downloadCampaignKit() {
    if (!result) {
      return;
    }

    buildCampaignKitFile(`campaign-kit-${requestId || "latest"}.md`, {
      input,
      result,
      approvals: approvedTabs,
      deployment
    });
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
              selectedFile={selectedFile}
              setSelectedFile={handlePdfSelect}
              onGenerate={handleGenerate}
              loading={loading || extractingPdf}
              error={error}
              result={result}
            />
          ) : null}

          {activeView === "agents" ? (
            <AgentsView
              liveLogs={liveLogs}
              agentStages={agentStages}
              loading={loading}
              result={result}
              hasCampaign={hasCampaign}
              deployment={deployment}
            />
          ) : null}

          {activeView === "analysis" ? (
            <ReviewView
              input={input}
              result={result}
              onExport={downloadResultJson}
              hasCampaign={hasCampaign}
              approvedTabs={approvedTabs}
              onApproveChannel={handleApproveChannel}
              onRegenerateChannel={handleRegenerateChannel}
              actionLoading={reviewActionLoading}
              error={error}
            />
          ) : null}

          {activeView === "preview" ? (
            <PreviewView
              result={result}
              onExport={downloadResultJson}
              onExportKit={downloadCampaignKit}
              onDeploy={handleDeployCampaign}
              hasCampaign={hasCampaign}
              approvedTabs={approvedTabs}
              deployment={deployment}
              actionLoading={previewActionLoading}
              error={error}
            />
          ) : null}

          {activeView === "settings" ? (
            <PlaceholderView title="Settings" description="This view is intentionally deferred while the primary production screens are refined." />
          ) : null}
        </main>
      </div>
    </div>
  );
}
