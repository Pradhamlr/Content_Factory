export default function PlaceholderView({ title, description }) {
  return (
    <section className="placeholder-view">
      <div className="placeholder-view__panel">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  );
}
