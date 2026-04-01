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

export default function AppTopbar({ activeView, status, requestId }) {
  const current = titles[activeView] || titles.campaigns;

  return (
    <header className="app-topbar">
      <div className="app-topbar__system">
        <div className="app-topbar__system-name">MARTECH_OS</div>
        <label className="app-topbar__search">
          <span className="material-symbols-outlined app-topbar__search-symbol" aria-hidden="true">search</span>
          <input type="text" placeholder="Search System..." aria-label={`Search ${current.title}`} />
        </label>
      </div>

      <div className="app-topbar__utility">
        <button type="button" className="app-topbar__icon-button" aria-label="Sensors">
          <span className="material-symbols-outlined">sensors</span>
        </button>
        <button type="button" className="app-topbar__icon-button is-notification" aria-label="Notifications">
          <span className="material-symbols-outlined">notifications</span>
          <span className="app-topbar__notification-dot"></span>
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
