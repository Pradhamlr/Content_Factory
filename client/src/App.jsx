import { useEffect, useRef, useState } from "react";
import AppSidebar from "./components/AppSidebar";
import AppTopbar from "./components/AppTopbar";
import AppToast from "./components/AppToast";
import { api, apiForm, buildCampaignKitFile, buildExportFile, downloadFromApi } from "./lib/api";
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
  const [sourceMode, setSourceMode] = useState("text");
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [requestId, setRequestId] = useState("");
  const [liveLogs, setLiveLogs] = useState([]);
  const [agentStages, setAgentStages] = useState(initialAgentStages);
  const [approvedTabs, setApprovedTabs] = useState({
    blog: false,
    tweets: false,
    email: false
  });
  const [reviewActionState, setReviewActionState] = useState(null);
  const [reviewActionLoading, setReviewActionLoading] = useState(false);
  const [deployment, setDeployment] = useState({
    deployed: false,
    deployedAt: null,
    deployedChannels: []
  });
  const [previewActionLoading, setPreviewActionLoading] = useState(false);
  const [savedCampaigns, setSavedCampaigns] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);
  const eventSourceRef = useRef(null);
  const hasCampaign = Boolean(requestId) || loading || Boolean(result);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    refreshSavedCampaigns();
  }, []);

  function resetPipelineState(nextRequestId) {
    window.clearTimeout(showToast.timeoutId);
    setRequestId(nextRequestId);
    setResult(null);
    setError("");
    setToast(null);
    setLiveLogs([]);
    setAgentStages(initialAgentStages);
    setReviewActionState(null);
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

  function applyCampaignState(payload, nextInput = input) {
    setResult(payload);
    setRequestId(payload?.requestId || "");
    setInput(nextInput);
    setSelectedFile(null);
    setApprovedTabs(
      payload?.approvals || {
        blog: false,
        tweets: false,
        email: false
      }
    );
    setDeployment(
      payload?.deployment || {
        deployed: false,
        deployedAt: null,
        deployedChannels: []
      }
    );
  }

  function appendLog(message, type = "system", timestamp = new Date().toISOString()) {
    setLiveLogs((current) => [...current, { message, type, timestamp }]);
  }

  function showToast(message, tone = "info", duration = 4200, icon) {
    const nextToast = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      message,
      tone,
      duration,
      icon:
        icon ||
        (tone === "approved"
          ? "verified"
          : tone === "rejected"
          ? "error"
          : tone === "error"
          ? "warning"
          : tone === "warning"
          ? "info"
          : "notifications")
    };

    setToast(nextToast);
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
      setToast((current) => (current?.id === nextToast.id ? null : current));
    }, duration);
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

  async function refreshSavedCampaigns() {
    setCampaignsLoading(true);

    try {
      const payload = await api("/api/campaigns");
      setSavedCampaigns(Array.isArray(payload?.campaigns) ? payload.campaigns : []);
    } catch {
      setSavedCampaigns([]);
    } finally {
      setCampaignsLoading(false);
    }
  }

  async function handleGenerate() {
    if (!input.trim() && !selectedFile) {
      setError(sourceMode === "url" ? "Please paste a URL before generating content." : "Please paste source material or upload a PDF before generating content.");
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

      if (sourceMode === "pdf" && selectedFile) {
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("requestId", nextRequestId);
        payload = await apiForm("/api/generate/upload", formData);
        setInput(payload.extractedText || input);
      } else if (sourceMode === "url") {
        payload = await api("/api/generate/url", {
          method: "POST",
          body: JSON.stringify({ url: input.trim(), requestId: nextRequestId })
        });
        setInput(payload.source?.extractedText || payload.extractedText || input.trim());
      } else {
        payload = await api("/api/generate", {
          method: "POST",
          body: JSON.stringify({ input: input.trim(), requestId: nextRequestId })
        });
      }

      applyCampaignState(payload, payload.source?.extractedText || payload.extractedText || input);
      showToast(
        payload.status === "APPROVED"
          ? "Campaign generated and approved by the Gatekeeper."
          : "Campaign generated, but the final review still needs attention.",
        payload.status === "APPROVED" ? "approved" : "warning",
        4200
      );
      await refreshSavedCampaigns();
    } catch (nextError) {
      setError(nextError.message);
      setResult(null);
      appendLog(nextError.message, "error");
      showToast(nextError.message, "error", 5600, "warning");
    } finally {
      setLoading(false);
    }
  }

  async function handlePdfSelect(file) {
    setSourceMode(file ? "pdf" : "text");
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
      showToast("PDF text extracted into the source field.", "approved", 3200, "upload_file");
    } catch (nextError) {
      setSelectedFile(null);
      setInput("");
      setError(nextError.message);
      showToast(nextError.message, "error", 5600, "warning");
    } finally {
      setExtractingPdf(false);
    }
  }

  async function handleLoadCampaign(campaignId) {
    try {
      setError("");
      eventSourceRef.current?.close();
      const payload = await api(`/api/campaigns/${campaignId}`);
      const hydratedInput = payload?.source?.extractedText || payload?.source?.originalInput || "";
      applyCampaignState(payload, hydratedInput);
      setSourceMode(payload?.source?.type || "text");
      setAgentStages({
        researcher: { ...initialAgentStages.researcher, status: payload?.facts ? "complete" : "standby" },
        writer: { ...initialAgentStages.writer, status: payload?.content ? "complete" : "waiting" },
        editor: {
          ...initialAgentStages.editor,
          status: (payload?.reviewStatus || payload?.status) === "APPROVED" ? "complete" : (payload?.reviewStatus || payload?.status)?.startsWith("REJECTED") ? "rejected" : "idle"
        }
      });
      setLiveLogs([
        {
          message: `Loaded saved campaign ${payload.campaignId}.`,
          type: "system",
          timestamp: new Date().toISOString()
        }
      ]);
      setActiveView("analysis");
      showToast("Saved campaign loaded.", "approved", 3200, "folder_open");
    } catch (nextError) {
      setError(nextError.message);
      showToast(nextError.message, "error", 5600, "warning");
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
    setReviewActionState({
      type: "regenerate",
      channel,
      status: "running",
      message: `Regenerating ${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"} only. The other two channels stay intact while the Gatekeeper re-reviews this asset.`
    });
    appendLog(
      `Targeted regeneration started for ${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"}. Other channels are being preserved.`,
      "system"
    );
    setAgentStages((current) => ({
      ...current,
      researcher: { ...current.researcher, status: result?.facts ? "complete" : current.researcher.status },
      writer: { ...current.writer, status: "running" },
      editor: { ...current.editor, status: "waiting" }
    }));

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
        status: payload.status || current?.status || "REJECTED",
        feedback: payload.feedback || current?.feedback || ""
      }));
      setReviewActionState({
        type: "regenerate",
        channel,
        status: payload.reviewStatus === "APPROVED" ? "approved" : "rejected",
        message:
          payload.reviewStatus === "APPROVED"
            ? `${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"} was regenerated and approved. The other channels were preserved.`
            : payload.preservedPrevious
            ? `${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"} regeneration was rejected, so the last approved version was kept and the rest of the campaign remains approved.`
            : `${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"} was regenerated but rejected by the Gatekeeper. The other channels were preserved.`
      });
      showToast(
        payload.reviewStatus === "APPROVED"
          ? `${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"} approved after regeneration.`
          : payload.preservedPrevious
          ? `${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"} rewrite was rejected, so the previous approved version was kept.`
          : `${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"} regeneration was rejected.`,
        payload.reviewStatus === "APPROVED" ? "approved" : payload.preservedPrevious ? "warning" : "rejected",
        4800
      );
      appendLog(
        payload.reviewStatus === "APPROVED"
          ? `Targeted regeneration approved for ${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"}.`
          : payload.preservedPrevious
          ? `Targeted regeneration was rejected for ${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"}, so the previous approved version was retained.`
          : `Targeted regeneration rejected for ${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"}.`,
        "system"
      );
      setAgentStages((current) => ({
        ...current,
        writer: { ...current.writer, status: "complete" },
        editor: { ...current.editor, status: payload.reviewStatus === "APPROVED" || payload.preservedPrevious ? "complete" : "rejected" }
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
      await refreshSavedCampaigns();
    } catch (nextError) {
      setError(nextError.message);
      setReviewActionState({
        type: "regenerate",
        channel,
        status: "error",
        message: nextError.message
      });
      setAgentStages((current) => ({
        ...current,
        writer: { ...current.writer, status: "error" },
        editor: { ...current.editor, status: "idle" }
      }));
      showToast(nextError.message, "error", 5600, "warning");
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
      setReviewActionState({
        type: "approval",
        channel,
        status: "approved",
        message: `${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"} approved and ready for export or deployment.`
      });
      showToast(
        `${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"} approved.`,
        "approved",
        3600
      );
      appendLog(
        `${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"} approval has been locked in for this campaign.`,
        "system"
      );
      setResult((current) =>
        current
          ? {
              ...current,
              approvals: payload.approvals || current.approvals
            }
          : current
      );
      await refreshSavedCampaigns();
    } catch (nextError) {
      setError(nextError.message);
      showToast(nextError.message, "error", 5600, "warning");
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
      showToast("Campaign deployment updated successfully.", "approved", 3800, "cloud_upload");
      setResult((current) =>
        current
          ? {
              ...current,
              deployment: payload.deployment || current.deployment
            }
          : current
      );
      await refreshSavedCampaigns();
    } catch (nextError) {
      setError(nextError.message);
      showToast(nextError.message, "error", 5600, "warning");
    } finally {
      setPreviewActionLoading(false);
    }
  }

  async function handleArtifactOpen(artifactKey) {
    if (!result?.campaignId) {
      return;
    }

    try {
      await downloadFromApi(`/api/campaigns/${result.campaignId}/artifacts/${artifactKey}`);
      showToast("Artifact downloaded.", "approved", 3000, "download");
    } catch (nextError) {
      setError(nextError.message);
      showToast(nextError.message, "error", 5600, "warning");
    }
  }

  function downloadCampaignKit() {
    if (!result) {
      return;
    }

    if (result.campaignId) {
      downloadFromApi(`/api/campaigns/${result.campaignId}/export`, `campaign-kit-${result.campaignId}.zip`).catch((nextError) => {
        setError(nextError.message);
        showToast(nextError.message, "error", 5600, "warning");
      });
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
      <AppToast toast={toast} />
      <AppSidebar activeView={activeView} onChange={setActiveView} />

      <div className="app-main">
        <AppTopbar activeView={activeView} status={result?.reviewStatus || result?.status || (loading ? "PROCESSING" : "STANDBY")} requestId={requestId} />

        <main className="app-content">
          {activeView === "campaigns" ? (
            <CampaignsView
              input={input}
              setInput={setInput}
              sourceMode={sourceMode}
              setSourceMode={setSourceMode}
              selectedFile={selectedFile}
              setSelectedFile={handlePdfSelect}
              onGenerate={handleGenerate}
              loading={loading || extractingPdf}
              error={error}
              result={result}
              savedCampaigns={savedCampaigns}
              campaignsLoading={campaignsLoading}
              onLoadCampaign={handleLoadCampaign}
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
              onArtifactOpen={handleArtifactOpen}
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
              actionState={reviewActionState}
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
