import { useEffect, useRef, useState } from "react";
import AppSidebar from "./components/AppSidebar";
import AppTopbar from "./components/AppTopbar";
import AppToast from "./components/AppToast";
import { api, apiForm, buildApiUrl, buildCampaignKitFile, buildExportFile, downloadFromApi } from "./lib/api";
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
  const [pdfReviewOpen, setPdfReviewOpen] = useState(false);
  const [pdfReviewDraft, setPdfReviewDraft] = useState("");
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
  const [approvalMeta, setApprovalMeta] = useState({
    blog: { approved: false, type: null, note: "", approvedAt: null },
    tweets: { approved: false, type: null, note: "", approvedAt: null },
    email: { approved: false, type: null, note: "", approvedAt: null }
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
    setApprovalMeta({
      blog: { approved: false, type: null, note: "", approvedAt: null },
      tweets: { approved: false, type: null, note: "", approvedAt: null },
      email: { approved: false, type: null, note: "", approvedAt: null }
    });
    setDeployment({
      deployed: false,
      deployedAt: null,
      deployedChannels: []
    });
    setPdfReviewOpen(false);
    setPdfReviewDraft("");
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
    setApprovalMeta(
      payload?.approvalMeta || {
        blog: { approved: false, type: null, note: "", approvedAt: null },
        tweets: { approved: false, type: null, note: "", approvedAt: null },
        email: { approved: false, type: null, note: "", approvedAt: null }
      }
    );
    setDeployment(
      payload?.deployment || {
        deployed: false,
        deployedAt: null,
        deployedChannels: []
      }
    );
    setPdfReviewOpen(false);
    setPdfReviewDraft("");
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
    const eventSource = new EventSource(buildApiUrl(`/api/generate/stream?requestId=${encodeURIComponent(nextRequestId)}`));
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
    if (sourceMode === "pdf" && selectedFile && !input.trim()) {
      setError("Review the extracted PDF text before starting the campaign.");
      showToast("Review and confirm the extracted PDF text before generating.", "warning", 4200, "picture_as_pdf");
      return;
    }

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
        payload = await api("/api/generate", {
          method: "POST",
          body: JSON.stringify({
            input: input.trim(),
            requestId: nextRequestId,
            source: {
              type: "pdf",
              label: selectedFile.name,
              originalInput: selectedFile.name,
              extractedText: input.trim()
            }
          })
        });
        setInput(input.trim());
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
    setPdfReviewOpen(false);
    setPdfReviewDraft("");

    if (!file) {
      return;
    }

    setExtractingPdf(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const payload = await apiForm("/api/generate/extract-pdf", formData);
      setPdfReviewDraft(payload.extractedText || "");
      setPdfReviewOpen(true);
      showToast("PDF text extracted. Review it before starting the campaign.", "approved", 3600, "upload_file");
    } catch (nextError) {
      setSelectedFile(null);
      setInput("");
      setPdfReviewOpen(false);
      setPdfReviewDraft("");
      setError(nextError.message);
      showToast(nextError.message, "error", 5600, "warning");
    } finally {
      setExtractingPdf(false);
    }
  }

  function handleClearSelectedFile() {
    setSelectedFile(null);
    setSourceMode("text");
    setPdfReviewOpen(false);
    setPdfReviewDraft("");
  }

  function handleApplyPdfReview() {
    setInput(pdfReviewDraft);
    setPdfReviewOpen(false);
    showToast("Reviewed PDF text applied to the source field.", "approved", 3200, "fact_check");
  }

  function handleCancelPdfReview() {
    setSelectedFile(null);
    setSourceMode("text");
    setPdfReviewOpen(false);
    setPdfReviewDraft("");
    showToast("PDF review canceled.", "warning", 2800, "close");
  }

  function handleLoadDemo() {
    setSourceMode("text");
    setInput(
      "PulseOS 4.2 helps marketing teams turn one source document into a coordinated launch package. It supports a research step that extracts factual claims, a writing step that creates a 400 to 500 word blog post, a five-part tweet thread, and a short email teaser, and an editing step that checks hallucinations, tone, and clarity before approval. The workflow is designed for product marketers, content strategists, and marketing operations teams that need faster content repurposing with less inconsistency."
    );
    setSelectedFile(null);
    setPdfReviewOpen(false);
    setPdfReviewDraft("");
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

  async function handleDeleteCampaign(campaignId) {
    try {
      await api(`/api/campaigns/${campaignId}`, { method: "DELETE" });
      setSavedCampaigns((current) => current.filter((campaign) => campaign.campaignId !== campaignId));

      if (result?.campaignId === campaignId) {
        resetPipelineState("");
        setInput("");
        setSelectedFile(null);
        setSourceMode("text");
        setActiveView("campaigns");
      }

      showToast("Campaign deleted.", "approved", 3200, "delete");
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

    const channelLabel = channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post";
    setReviewActionLoading(true);
    setError("");
    setActiveView("agents");
    setReviewActionState({
      type: "regenerate",
      channel,
      status: "running",
      message: `Regenerating ${channelLabel} only. The other two channels stay intact while the Gatekeeper re-reviews this asset.`
    });
    appendLog(
      `Targeted regeneration started for ${channelLabel}. Other channels are being preserved.`,
      "system"
    );
    showToast(`${channelLabel} regeneration is running in the Agent Room.`, "info", 3400, "hub");
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
        feedback: payload.feedback || current?.feedback || "",
        reviewStatus: payload.reviewStatus || current?.reviewStatus || current?.status,
        approvalMeta: payload.approvalMeta || current?.approvalMeta,
        manualInstructions: payload.manualInstructions || current?.manualInstructions,
        pendingGuidance: payload.pendingGuidance ?? current?.pendingGuidance ?? null,
        lastAppliedGuidance: payload.lastAppliedGuidance ?? current?.lastAppliedGuidance ?? null,
        revisionHistory: payload.revisionHistory || current?.revisionHistory,
        telemetry: payload.telemetry || current?.telemetry
      }));
      setReviewActionState({
        type: "regenerate",
        channel,
        status: payload.reviewStatus === "APPROVED" ? "approved" : "rejected",
        message:
          payload.reviewStatus === "APPROVED"
            ? `${channelLabel} was regenerated and approved. The other channels were preserved.`
            : payload.preservedPrevious
            ? `${channelLabel} regeneration was rejected, so the last approved version was kept and the rest of the campaign remains approved.`
            : `${channelLabel} was regenerated but rejected by the Gatekeeper. The other channels were preserved.`
      });
      showToast(
        payload.reviewStatus === "APPROVED"
          ? `${channelLabel} approved after regeneration. Review the updated content in Content Library.`
          : payload.preservedPrevious
          ? `${channelLabel} rewrite was rejected, so the previous approved version was kept.`
          : `${channelLabel} regeneration was rejected. Review the Gatekeeper flow for details.`,
        payload.reviewStatus === "APPROVED" ? "approved" : payload.preservedPrevious ? "warning" : "rejected",
        4800
      );
      appendLog(
        payload.reviewStatus === "APPROVED"
          ? `Targeted regeneration approved for ${channelLabel}.`
          : payload.preservedPrevious
          ? `Targeted regeneration was rejected for ${channelLabel}, so the previous approved version was retained.`
          : `Targeted regeneration rejected for ${channelLabel}.`,
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
      setApprovalMeta(payload.approvalMeta || {
        blog: { approved: false, type: null, note: "", approvedAt: null },
        tweets: { approved: false, type: null, note: "", approvedAt: null },
        email: { approved: false, type: null, note: "", approvedAt: null }
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
      setApprovalMeta(payload.approvalMeta || {
        blog: { approved: false, type: null, note: "", approvedAt: null },
        tweets: { approved: false, type: null, note: "", approvedAt: null },
        email: { approved: false, type: null, note: "", approvedAt: null }
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
              approvals: payload.approvals || current.approvals,
              approvalMeta: payload.approvalMeta || current.approvalMeta
            }
          : current
      );
      await refreshSavedCampaigns();
    } catch (nextError) {
      setError(nextError.message);
      showToast(nextError.message, "error", 5600, "warning");
    }
  }

  async function handleManualOverride(channel, note) {
    if (!requestId || !note.trim() || reviewActionLoading) {
      return;
    }

    setReviewActionLoading(true);
    setError("");

    try {
      const payload = await api("/api/generate/manual-override", {
        method: "POST",
        body: JSON.stringify({
          requestId,
          channel,
          note: note.trim()
        })
      });

      setApprovedTabs(payload.approvals || {
        blog: false,
        tweets: false,
        email: false
      });
      setApprovalMeta(payload.approvalMeta || {
        blog: { approved: false, type: null, note: "", approvedAt: null },
        tweets: { approved: false, type: null, note: "", approvedAt: null },
        email: { approved: false, type: null, note: "", approvedAt: null }
      });
      setResult((current) =>
        current
          ? {
              ...current,
              approvals: payload.approvals || current.approvals,
              approvalMeta: payload.approvalMeta || current.approvalMeta,
              revisionHistory: payload.revisionHistory || current.revisionHistory
            }
          : current
      );
      appendLog(
        `Manual override applied to ${channel === "tweets" ? "Social Thread" : channel === "email" ? "Email Teaser" : "Blog Post"}.`,
        "system"
      );
      showToast("Manual override saved.", "approved", 3600, "verified");
      await refreshSavedCampaigns();
    } catch (nextError) {
      setError(nextError.message);
      showToast(nextError.message, "error", 5600, "warning");
    } finally {
      setReviewActionLoading(false);
    }
  }

  async function handleOperatorInput(message) {
    if (!requestId || !message.trim()) {
      return;
    }

    try {
      const payload = await api("/api/generate/operator-input", {
        method: "POST",
        body: JSON.stringify({
          requestId,
          message: message.trim()
        })
      });

      setResult((current) =>
        current
          ? {
              ...current,
              manualInstructions: payload.manualInstructions || current.manualInstructions,
              pendingGuidance: payload.pendingGuidance ?? current.pendingGuidance ?? null,
              lastAppliedGuidance: payload.lastAppliedGuidance ?? current.lastAppliedGuidance ?? null
            }
          : current
      );
      appendLog(`Operator guidance received: ${message.trim()}`, "system");
      showToast(
        payload.pendingGuidance
          ? "Operator guidance saved for the next targeted rewrite."
          : "Operator guidance queued for the next draft/review cycle.",
        "approved",
        3400,
        "terminal"
      );
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
              onClearSelectedFile={handleClearSelectedFile}
              pdfReviewOpen={pdfReviewOpen}
              pdfReviewDraft={pdfReviewDraft}
              setPdfReviewDraft={setPdfReviewDraft}
              onApplyPdfReview={handleApplyPdfReview}
              onCancelPdfReview={handleCancelPdfReview}
              onLoadDemo={handleLoadDemo}
              onGenerate={handleGenerate}
              loading={loading || extractingPdf}
              savedCampaigns={savedCampaigns}
              campaignsLoading={campaignsLoading}
              onLoadCampaign={handleLoadCampaign}
              onDeleteCampaign={handleDeleteCampaign}
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
              reviewActionState={reviewActionState}
              onArtifactOpen={handleArtifactOpen}
              onSubmitOperatorInput={handleOperatorInput}
            />
          ) : null}

          {activeView === "analysis" ? (
            <ReviewView
              input={input}
              result={result}
              onExport={downloadResultJson}
              hasCampaign={hasCampaign}
              approvedTabs={approvedTabs}
              approvalMeta={approvalMeta}
              onApproveChannel={handleApproveChannel}
              onRegenerateChannel={handleRegenerateChannel}
              onManualOverride={handleManualOverride}
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
              onNotify={showToast}
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
