const CATEGORY_ICONS = { venue: "🏛️", food: "🍽️", media: "📸" };
const STATUS_CONFIG = {
  pending: { label: "Awaiting Confirmation", color: "#f2b84b", bg: "#fef9ec", pulse: true },
  confirmed: { label: "Booking Confirmed", color: "#197a67", bg: "#e8f7f1", pulse: false },
};

export default function BookingCard({ card, onSimulateConfirm, sessionId }) {
  const cfg = STATUS_CONFIG[card.status] || STATUS_CONFIG.pending;

  return (
    <div className={`booking-card booking-card--${card.status}`}>
      <div className="booking-card__top">
        <div className="booking-card__icon-wrap">
          <span className="booking-card__icon">{CATEGORY_ICONS[card.category]}</span>
          {cfg.pulse && <span className="booking-card__pulse" />}
        </div>
        <div className="booking-card__meta">
          <p className="booking-card__category">{card.category.toUpperCase()}</p>
          <h3 className="booking-card__name">{card.vendor_name}</h3>
          {card.address && <p className="booking-card__address">{card.address}</p>}
        </div>
        <div
          className="booking-card__status-badge"
          style={{ color: cfg.color, background: cfg.bg }}
        >
          {card.status === "confirmed" ? "✓ " : "⏳ "}
          {cfg.label}
        </div>
      </div>

      <div className="booking-card__cost">
        <span className="booking-card__cost-label">Booking value</span>
        <span className="booking-card__cost-value">${card.cost_usd.toLocaleString()}</span>
      </div>

      {card.status === "confirmed" && card.confirmed_at && (
        <p className="booking-card__timestamp">
          Confirmed {new Date(card.confirmed_at).toLocaleString()}
        </p>
      )}

      {card.status === "pending" && onSimulateConfirm && (
        <button
          className="booking-card__confirm-btn"
          onClick={() => onSimulateConfirm(sessionId, card.vendor_id)}
        >
          Simulate Vendor Confirm →
        </button>
      )}

      {card.status === "confirmed" && (
        <div className="booking-card__confirmed-banner">
          🎉 Space secured — you&apos;re all set!
        </div>
      )}
    </div>
  );
}
