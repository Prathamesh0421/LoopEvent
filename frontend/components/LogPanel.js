export default function LogPanel({ logs = [] }) {
  return (
    <section aria-label="Execution log" style={{ background: "#111", color: "#0f0", fontFamily: "monospace", padding: 12, borderRadius: 8, marginTop: 16, minHeight: 120 }}>
      {logs.map((line, index) => <div key={`${index}-${line}`}>{line}</div>)}
    </section>
  );
}

