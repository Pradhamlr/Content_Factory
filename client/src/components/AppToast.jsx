export default function AppToast({ toast }) {
  if (!toast) {
    return null;
  }

  return (
    <div className={`app-toast is-${toast.tone || "info"}`} key={toast.id}>
      <div className="app-toast__body">
        <span className="material-symbols-outlined">{toast.icon || "info"}</span>
        <span>{toast.message}</span>
      </div>
      <div className="app-toast__timer">
        <div key={`${toast.id}-timer`} style={{ animationDuration: `${toast.duration || 4200}ms` }}></div>
      </div>
    </div>
  );
}
