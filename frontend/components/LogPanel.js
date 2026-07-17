export default function LogPanel({ logs = [] }) {
  return (
    <section className="panel log-panel" aria-label="Planning activity">
      <p className="section-kicker">Live activity</p>
      <h2 className="log-title">Planning timeline</h2>
      <div className="log-list">
        {logs.length ? logs.map((line, index) => <div className="log-row" key={`${index}-${line}`}>{line}</div>) : <p className="log-empty">Waiting for the planning loop to begin.</p>}
      </div>
    </section>
  );
}
