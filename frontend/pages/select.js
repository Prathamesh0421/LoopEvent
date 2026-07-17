import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import dynamic from "next/dynamic";

import SelectionPanel from "../components/SelectionPanel";
import { getSession, submitSelection } from "../lib/api";

// Dynamically import map to avoid SSR issues with mapbox-gl
const VenueMap = dynamic(() => import("../components/VenueMap"), { ssr: false });

const STEPS = ["Map & Venues", "Review & Select", "Confirm Bookings"];

export default function SelectPage() {
  const router = useRouter();
  const { session: sessionId } = router.query;

  const [session, setSession] = useState(null);
  const [step, setStep] = useState(0); // 0 = map view, 1 = selection panel
  const [selections, setSelections] = useState({ venue: null, food: null, media: null });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("map"); // 'map' | 'list'

  // Load session on mount
  useEffect(() => {
    if (!sessionId) return;
    getSession(sessionId)
      .then(setSession)
      .catch((e) => setError(e.message));
  }, [sessionId]);

  // When a vendor pin / card is clicked
  function handleVendorClick(vendor) {
    setSelections((prev) => ({ ...prev, [vendor.category]: vendor.vendor_id }));
  }

  function handleSelect(category, vendorId) {
    setSelections((prev) => ({ ...prev, [category]: vendorId }));
  }

  const allSelected = selections.venue && selections.food && selections.media;

  async function handleSubmitSelection() {
    if (!allSelected) return;
    setSubmitting(true);
    setError("");
    try {
      const updated = await submitSelection(sessionId, {
        venue_id: selections.venue,
        food_id: selections.food,
        media_id: selections.media,
      });
      setSession(updated);
      // Navigate to booking/dashboard view
      router.push(`/dashboard?session=${sessionId}`);
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  if (error && !session) {
    return (
      <main className="terminal-state error" role="alert">
        <h1>Something went wrong</h1>
        <p>{error}</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="terminal-state">
        <div className="loading-spinner" />
        <h1>Loading your options…</h1>
        <p>Fetching venues, food, and media vendors near {router.query.location || "San Francisco"}.</p>
      </main>
    );
  }

  const eligibleVenueIds = new Set(
    (session.venue_options || []).map((v) => v.vendor_id)
  );
  const allVendors = [
    ...(session.venue_options || []),
    ...(session.food_options || []),
    ...(session.media_options || []),
  ];

  const selectedCount = Object.values(selections).filter(Boolean).length;

  return (
    <div className="select-shell">
      {/* NAV */}
      <nav className="site-nav" aria-label="Main navigation">
        <a className="brand" href="/">
          <span className="brand-mark">L</span>LoopEvent
        </a>
        <div className="stepper" aria-label="Planning steps">
          {STEPS.map((s, i) => (
            <div key={s} className={`step ${i === 0 ? "step--active" : ""} ${i < 0 ? "step--done" : ""}`}>
              <span className="step-num">{i + 1}</span>
              <span className="step-label">{s}</span>
              {i < STEPS.length - 1 && <span className="step-sep" />}
            </div>
          ))}
        </div>
        <span className="nav-badge">
          {selectedCount}/3 selected
        </span>
      </nav>

      {/* HEADER */}
      <div className="select-header">
        <div className="select-header__left">
          <p className="eyebrow">AI Venue Scout</p>
          <h1 className="select-title">
            {session.venue_options.length} venues found in{" "}
            <em>{session.request.location}</em>
          </h1>
          <p className="select-subtitle">
            {session.request.attendees.toLocaleString()} guests · Budget ${session.request.budget_usd.toLocaleString()} · 
            Click a pin on the map or browse below to make your selections.
          </p>
        </div>
        <div className="select-header__logs">
          {(session.logs || []).map((log, i) => (
            <div key={i} className="mini-log">{log}</div>
          ))}
        </div>
      </div>

      {/* TAB TOGGLE */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === "map" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("map")}
        >
          🗺️ Map View
        </button>
        <button
          className={`tab-btn ${activeTab === "list" ? "tab-btn--active" : ""}`}
          onClick={() => setActiveTab("list")}
        >
          📋 List View
        </button>
      </div>

      {/* MAIN CONTENT */}
      <div className="select-body">
        {activeTab === "map" && (
          <div className="map-and-sidebar">
            {/* Map */}
            <div className="map-col">
              <VenueMap
                vendors={allVendors}
                selectedIds={selections}
                eligibleVenueIds={eligibleVenueIds}
                onVendorClick={handleVendorClick}
              />
            </div>

            {/* Sidebar: selected so far */}
            <aside className="map-sidebar">
              <h2 className="sidebar-title">Your Selections</h2>

              {["venue", "food", "media"].map((cat) => {
                const vid = selections[cat];
                const vendor = allVendors.find((v) => v.vendor_id === vid);
                const icon = { venue: "🏛️", food: "🍽️", media: "📸" }[cat];
                const label = { venue: "Event Space", food: "Catering", media: "Media" }[cat];
                return (
                  <div key={cat} className={`sidebar-slot ${vid ? "sidebar-slot--filled" : ""}`}>
                    <span className="sidebar-slot__icon">{icon}</span>
                    <div className="sidebar-slot__info">
                      <span className="sidebar-slot__label">{label}</span>
                      {vendor ? (
                        <>
                          <span className="sidebar-slot__name">{vendor.name}</span>
                          <span className="sidebar-slot__cost">${vendor.cost_usd.toLocaleString()}</span>
                        </>
                      ) : (
                        <span className="sidebar-slot__empty">Click a pin to select</span>
                      )}
                    </div>
                    {vid && (
                      <button
                        className="sidebar-slot__remove"
                        onClick={() => setSelections((p) => ({ ...p, [cat]: null }))}
                        aria-label={`Remove ${label}`}
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}

              <button
                className="switch-to-list-btn"
                onClick={() => setActiveTab("list")}
              >
                Browse all options ↓
              </button>
            </aside>
          </div>
        )}

        {activeTab === "list" && (
          <SelectionPanel
            session={session}
            selections={selections}
            onSelect={handleSelect}
          />
        )}
      </div>

      {/* STICKY FOOTER CTA */}
      <div className={`select-footer ${allSelected ? "select-footer--ready" : ""}`}>
        <div className="select-footer__summary">
          {allSelected ? (
            <span className="footer-ready">
              ✓ All vendors selected — ready to draft booking emails
            </span>
          ) : (
            <span className="footer-hint">
              Select 1 venue, 1 food, and 1 media vendor to continue
            </span>
          )}
        </div>
        {error && <p className="form-error">{error}</p>}
        <button
          className="primary-button footer-proceed-btn"
          disabled={!allSelected || submitting}
          onClick={handleSubmitSelection}
        >
          {submitting ? (
            "Drafting booking emails…"
          ) : (
            <>Generate Booking Emails <span className="button-arrow">→</span></>
          )}
        </button>
      </div>
    </div>
  );
}
