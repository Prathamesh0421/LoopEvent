import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import BookingCard from "../components/BookingCard";
import LogPanel from "../components/LogPanel";
import { confirmVendor, getSession } from "../lib/api";

const EMAIL_ICON = { venue: "🏛️", food: "🍽️", media: "📸" };

function EmailDraftCard({ draft, index }) {
  const [open, setOpen] = useState(index === 0);
  return (
    <div className={`email-draft-card ${open ? "email-draft-card--open" : ""}`}>
      <button
        className="email-draft-card__header"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="email-draft-card__icon">{EMAIL_ICON[draft.category]}</span>
        <div className="email-draft-card__meta">
          <span className="email-draft-card__to">To: {draft.vendor_name}</span>
          <span className="email-draft-card__subject">{draft.subject}</span>
        </div>
        <span className="email-draft-card__chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="email-draft-card__body">
          <pre className="email-body-text">{draft.body}</pre>
          <div className="email-draft-card__actions">
            <span className="email-sent-badge">✓ Sent to vendor inbox (simulated)</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { session: sessionId } = router.query;

  const [session, setSession] = useState(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(null);

  // Poll session every 2s while booking is in progress
  useEffect(() => {
    if (!sessionId) return undefined;
    let active = true;

    async function refresh() {
      try {
        const data = await getSession(sessionId);
        if (active) setSession(data);
      } catch (e) {
        if (active) setError(e.message);
      }
    }

    refresh();
    const interval = setInterval(refresh, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  async function handleConfirm(sid, vendorId) {
    setConfirming(vendorId);
    setError("");
    try {
      setSession(await confirmVendor(sid, vendorId));
    } catch (e) {
      setError(e.message);
    } finally {
      setConfirming(null);
    }
  }

  if (error && !session) {
    return (
      <main className="terminal-state error" role="alert">
        <h1>Planning service unavailable</h1>
        <p>{error}</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="terminal-state">
        <div className="loading-spinner" />
        <h1>Loading your booking status…</h1>
        <p>Connecting to the LoopEvent planning service.</p>
      </main>
    );
  }

  const confirmedCount = (session.booking_cards || []).filter(
    (c) => c.status === "confirmed"
  ).length;
  const totalCards = (session.booking_cards || []).length;
  const allConfirmed = confirmedCount === totalCards && totalCards > 0;

  return (
    <div className="dashboard-shell">
      <nav className="site-nav" aria-label="Main navigation">
        <a className="brand" href="/">
          <span className="brand-mark">L</span>LoopEvent
        </a>
        <span className="nav-badge">
          {session.status === "executed" ? "🎊 EVENT BOOKED" : "SESSION ACTIVE"}
        </span>
      </nav>

      <main className="dashboard-content">
        <a className="back-link" href="/">← Create another event</a>

        {/* HEADER */}
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Booking Dashboard</p>
            <h1 className="dashboard-title">
              {session.status === "executed"
                ? "Your event is confirmed! 🎉"
                : "Booking in progress…"}
            </h1>
            <p className="dashboard-subtitle">
              {session.request.attendees.toLocaleString()} guests ·{" "}
              {session.request.location} · Budget $
              {session.request.budget_usd.toLocaleString()}
            </p>
          </div>
          <span className={`status-chip ${session.status}`}>
            {session.status.replaceAll("_", " ")}
          </span>
        </header>

        {error && <p className="form-error" role="alert">{error}</p>}

        {/* BOOKING PROGRESS */}
        {totalCards > 0 && (
          <div className="booking-progress-bar">
            <span className="booking-progress-label">
              {confirmedCount}/{totalCards} bookings confirmed
            </span>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${(confirmedCount / totalCards) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* BOOKING CARDS */}
        {session.booking_cards && session.booking_cards.length > 0 && (
          <section className="booking-cards-section">
            <h2 className="section-heading-lg">Vendor Bookings</h2>
            <div className="booking-cards-grid">
              {session.booking_cards.map((card) => (
                <BookingCard
                  key={card.card_id}
                  card={card}
                  sessionId={sessionId}
                  onSimulateConfirm={
                    !allConfirmed && confirming !== card.vendor_id
                      ? handleConfirm
                      : null
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* EMAIL DRAFTS */}
        {session.email_drafts && session.email_drafts.length > 0 && (
          <section className="email-drafts-section">
            <h2 className="section-heading-lg">AI-Drafted Booking Emails</h2>
            <p className="section-subtext">
              LoopEvent&apos;s AI composed these professional booking inquiries for each vendor.
            </p>
            <div className="email-drafts-list">
              {session.email_drafts.map((draft, i) => (
                <EmailDraftCard key={draft.vendor_id} draft={draft} index={i} />
              ))}
            </div>
          </section>
        )}

        {/* ITINERARY SUMMARY */}
        {session.itinerary && (
          <section className="itinerary-summary-section">
            <h2 className="section-heading-lg">Plan Summary</h2>
            <div className="itinerary-summary-grid">
              {session.itinerary.items.map((item) => (
                <div key={item.vendor_id} className="itinerary-summary-item">
                  <span className="isi-icon">{EMAIL_ICON[item.category]}</span>
                  <div>
                    <p className="isi-category">{item.category}</p>
                    <p className="isi-name">{item.name}</p>
                  </div>
                  <span className="isi-cost">${item.cost_usd.toLocaleString()}</span>
                </div>
              ))}
              <div className="itinerary-summary-total">
                <strong>Total</strong>
                <span>${session.itinerary.total_proposed_cost.toLocaleString()}</span>
              </div>
            </div>
          </section>
        )}

        {/* LOGS */}
        <section className="logs-section">
          <LogPanel logs={session.logs} />
        </section>

        {/* ALL CONFIRMED BANNER */}
        {allConfirmed && (
          <div className="all-confirmed-banner">
            <span className="all-confirmed-emoji">🎊</span>
            <div>
              <h2>All bookings confirmed!</h2>
              <p>Your event is fully booked. Check your email for vendor confirmations.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
