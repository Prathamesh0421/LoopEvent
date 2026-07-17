export default function ItineraryCard({ itinerary, evaluatorResult }) {
  if (!itinerary) return null;
  const categoryIcons = { venue: "⌂", food: "✦", media: "◉" };

  return (
    <section className="panel itinerary-card">
      <div className="itinerary-head">
        <div>
          <p className="section-kicker">Proposed itinerary</p>
          <h2 className="section-heading">Your event, mapped out</h2>
        </div>
        <span className="total-pill">${itinerary.total_proposed_cost.toLocaleString()}</span>
      </div>
      <ul className="itinerary-list">
        {itinerary.items.map((item) => (
          <li className="itinerary-item" key={item.vendor_id}>
            <div className="item-left">
              <span className="category-icon" aria-hidden="true">{categoryIcons[item.category] || "•"}</span>
              <div>
                <p className="item-category">{item.category}</p>
                <p className="item-name">{item.name}</p>
              </div>
            </div>
            <span className="item-cost">${item.cost_usd.toLocaleString()}</span>
          </li>
        ))}
      </ul>
      {evaluatorResult && (
        <div className={`evaluation ${evaluatorResult.passed ? "valid" : "invalid"}`}>
          <strong>{evaluatorResult.passed ? "✓ Plan validated" : "! Plan needs revision"}</strong>
          {evaluatorResult.reason}
        </div>
      )}
    </section>
  );
}
