const CATEGORY_ICONS = {
  venue: "🏛️",
  food: "🍽️",
  media: "📸",
};

const CATEGORY_LABELS = {
  venue: "Event Space",
  food: "Catering",
  media: "Photography & Media",
};

function StarRating({ score }) {
  if (!score) return null;
  const full = Math.floor(score);
  const half = score - full >= 0.5;
  return (
    <span className="star-rating" aria-label={`${score} stars`}>
      {"★".repeat(full)}
      {half ? "½" : ""}
      <span className="star-score">{score}</span>
    </span>
  );
}

function VendorCard({ vendor, isSelected, onSelect }) {
  return (
    <div
      className={`vendor-card ${isSelected ? "vendor-card--selected" : ""}`}
      onClick={() => onSelect(vendor)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect(vendor)}
      aria-pressed={isSelected}
    >
      {isSelected && <div className="vendor-card__check">✓</div>}
      <div className="vendor-card__header">
        <span className="vendor-card__icon">{CATEGORY_ICONS[vendor.category]}</span>
        <div className="vendor-card__name-wrap">
          <p className="vendor-card__name">{vendor.name}</p>
          {vendor.address && (
            <p className="vendor-card__address">{vendor.address}</p>
          )}
        </div>
      </div>

      <div className="vendor-card__stats">
        <span className="vendor-card__cost">${vendor.cost_usd.toLocaleString()}</span>
        {vendor.review_score && (
          <StarRating score={vendor.review_score} />
        )}
        {vendor.review_count && (
          <span className="vendor-card__reviews">({vendor.review_count} reviews)</span>
        )}
      </div>

      {vendor.capacity > 0 && (
        <p className="vendor-card__capacity">
          👥 Capacity: {vendor.capacity.toLocaleString()} guests
        </p>
      )}

      {vendor.description && (
        <p className="vendor-card__desc">{vendor.description}</p>
      )}

      {vendor.amenities && vendor.amenities.length > 0 && (
        <div className="vendor-card__amenities">
          {vendor.amenities.map((a) => (
            <span key={a} className="amenity-tag">{a}</span>
          ))}
        </div>
      )}

      <button
        className={`vendor-card__btn ${isSelected ? "vendor-card__btn--selected" : ""}`}
        onClick={(e) => { e.stopPropagation(); onSelect(vendor); }}
      >
        {isSelected ? "✓ Selected" : "Select"}
      </button>
    </div>
  );
}

export default function SelectionPanel({
  session,
  selections,
  onSelect,
}) {
  const categories = [
    { key: "venue", vendors: session.venue_options || [] },
    { key: "food", vendors: session.food_options || [] },
    { key: "media", vendors: session.media_options || [] },
  ];

  const totalCost = Object.keys(selections).reduce((sum, cat) => {
    const vid = selections[cat];
    if (!vid) return sum;
    const allVendors = [
      ...(session.venue_options || []),
      ...(session.food_options || []),
      ...(session.media_options || []),
    ];
    const v = allVendors.find((x) => x.vendor_id === vid);
    return sum + (v ? v.cost_usd : 0);
  }, 0);

  const allSelected =
    selections.venue && selections.food && selections.media;
  const overBudget = totalCost > session.request.budget_usd;

  return (
    <div className="selection-panel">
      <div className="selection-panel__budget-bar">
        <span className="budget-label">Budget</span>
        <div className="budget-track">
          <div
            className={`budget-fill ${overBudget ? "budget-fill--over" : ""}`}
            style={{
              width: `${Math.min((totalCost / session.request.budget_usd) * 100, 100)}%`,
            }}
          />
        </div>
        <span className={`budget-value ${overBudget ? "budget-value--over" : ""}`}>
          ${totalCost.toLocaleString()} / ${session.request.budget_usd.toLocaleString()}
          {overBudget && " ⚠️ Over budget"}
        </span>
      </div>

      {categories.map(({ key, vendors }) => (
        <section key={key} className="selection-category">
          <div className="selection-category__header">
            <span className="selection-category__icon">{CATEGORY_ICONS[key]}</span>
            <h3 className="selection-category__label">{CATEGORY_LABELS[key]}</h3>
            <span className="selection-category__count">{vendors.length} options</span>
          </div>
          <div className="vendor-card-grid">
            {vendors.map((v) => (
              <VendorCard
                key={v.vendor_id}
                vendor={v}
                isSelected={selections[key] === v.vendor_id}
                onSelect={(vendor) => onSelect(key, vendor.vendor_id)}
              />
            ))}
          </div>
        </section>
      ))}

      {allSelected && (
        <div className={`selection-summary ${overBudget ? "selection-summary--over" : ""}`}>
          <div className="selection-summary__row">
            <strong>Total estimated cost</strong>
            <span>${totalCost.toLocaleString()}</span>
          </div>
          <div className="selection-summary__row selection-summary__row--muted">
            <span>Budget remaining</span>
            <span className={overBudget ? "text-danger" : "text-success"}>
              {overBudget ? "-" : "+"}${Math.abs(session.request.budget_usd - totalCost).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
