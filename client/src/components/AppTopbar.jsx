const titles = {
  campaigns: {
    eyebrow: "",
    title: "Campaign Assembly"
  },
  agents: {
    eyebrow: "WAR ROOM STATUS",
    title: "Agent Collaborative Core"
  },
  analysis: {
    eyebrow: "",
    title: "Content Library"
  },
  preview: {
    eyebrow: "",
    title: "Preview"
  }
};

export default function AppTopbar({ activeView, status, requestId, searchQuery, onSearchQueryChange, onSearchSubmit, onTelemetryClick, onNotificationsClick }) {
  const current = titles[activeView] || titles.campaigns;

  return (
    <header className="app-topbar">
      <div className="app-topbar__system">
        <form
          className="app-topbar__search"
          onSubmit={(event) => {
            event.preventDefault();
            onSearchSubmit?.(searchQuery || "");
          }}
        >
          <span className="material-symbols-outlined app-topbar__search-symbol" aria-hidden="true">search</span>
          <input
            type="search"
            value={searchQuery || ""}
            onChange={(event) => onSearchQueryChange?.(event.target.value)}
            placeholder="Search System..."
            aria-label={`Search ${current.title}`}
          />
        </form>
      </div>

      <div className="app-topbar__utility">
        <button type="button" className="app-topbar__icon-button" aria-label="Open live telemetry" onClick={onTelemetryClick}>
          <span className="material-symbols-outlined">sensors</span>
        </button>
        <button type="button" className="app-topbar__icon-button is-notification" aria-label="Show notifications" onClick={onNotificationsClick}>
          <span className="material-symbols-outlined">notifications</span>
          {status && status !== "STANDBY" ? <span className="app-topbar__notification-dot"></span> : null}
        </button>
        <div className="app-topbar__divider"></div>
        <button type="button" className="app-topbar__admin" aria-label="Admin account">
          <span className="material-symbols-outlined">account_circle</span>
          <span>Admin</span>
        </button>
      </div>
    </header>
  );
}
