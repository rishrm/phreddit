const CONTENT = {
  connecting: {
    title: "Starting Phreddit",
    description: "Checking your session and loading the latest discussions."
  },
  waking: {
    title: "Waking the demo server",
    description:
      "The demo server was idle. Its first request can take up to a minute.",
    detail: "Once it wakes, the rest of your visit will be fast."
  },
  error: {
    title: "Phreddit could not connect",
    description: "The discussion server is not responding right now."
  }
};

export default function BootstrapScreen({ phase, error, onRetry }) {
  const isError = phase === "error";
  const content = CONTENT[phase] || CONTENT.connecting;

  return (
    <main className="bootstrap-screen">
      <section className="bootstrap-panel" aria-labelledby="bootstrap-title">
        <p className="bootstrap-brand">phreddit</p>
        <div
          className="bootstrap-status"
          role={isError ? "alert" : "status"}
          aria-live={isError ? "assertive" : "polite"}
          aria-busy={!isError}
        >
          {!isError && <span className="bootstrap-spinner" aria-hidden="true" />}
          <h1 id="bootstrap-title">{content.title}</h1>
          <p>{error || content.description}</p>
          {content.detail && !error && (
            <p className="bootstrap-detail">{content.detail}</p>
          )}
          {isError && (
            <button type="button" onClick={onRetry}>
              Retry connection
            </button>
          )}
        </div>
      </section>
    </main>
  );
}
