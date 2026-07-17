export default function ItineraryCard({ itinerary, evaluatorResult }) {
  if (!itinerary) return null;
  return (
    <section style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginTop: 16 }}>
      <h2>Proposed Itinerary</h2>
      <ul>
        {itinerary.items.map((item) => (
          <li key={item.vendor_id}>
            <strong>{item.category}</strong>: {item.name} — ${item.cost_usd.toFixed(2)}
          </li>
        ))}
      </ul>
      <p>Total: ${itinerary.total_proposed_cost.toFixed(2)}</p>
      {evaluatorResult && (
        <p style={{ color: evaluatorResult.passed ? "green" : "red" }}>
          {evaluatorResult.passed ? "VALIDATED" : "REJECTED"} — {evaluatorResult.reason}
        </p>
      )}
    </section>
  );
}

