const navItems = [
  { key: "campaigns", label: "Campaigns", icon: "rocket_launch" },
  { key: "agents", label: "Agents", icon: "smart_toy" },
  { key: "analysis", label: "Content Library", icon: "auto_stories" },
  { key: "preview", label: "Preview", icon: "devices" }
];

export default function AppSidebar({ activeView, onChange }) {
  return (
    <aside className="app-sidebar">
      <div className="app-sidebar__brand">
        <div className="app-sidebar__brand-copy">
          <div className="app-sidebar__title">AUTONOMOUS</div>
          <div className="app-sidebar__title">CONTENT FACTORY</div>
          <div className="app-sidebar__subtitle">PRECISION MARKETING AI</div>
        </div>
      </div>

      <nav className="app-sidebar__nav">
        {navItems.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`app-sidebar__nav-item ${activeView === item.key ? "is-active" : ""}`}
            onClick={() => onChange(item.key)}
          >
            <span className="material-symbols-outlined app-sidebar__nav-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="app-sidebar__footer">
        <button type="button" className="app-sidebar__new-button" onClick={() => onChange("campaigns")}>
          <span className="material-symbols-outlined" aria-hidden="true">add</span>
          <span>New Campaign</span>
        </button>
        <div className="app-sidebar__profile">
          <div className="app-sidebar__avatar">FA</div>
          <div>
            <div className="app-sidebar__profile-name">Factory Architect</div>
            <div className="app-sidebar__profile-role">SYSTEM ADMIN</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
