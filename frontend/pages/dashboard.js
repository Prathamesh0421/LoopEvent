import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import ApprovalButton from "../components/ApprovalButton";
import ItineraryCard from "../components/ItineraryCard";
import LogPanel from "../components/LogPanel";
import { approveSession, getSession } from "../lib/api";

export default function Dashboard() {
  const router = useRouter();
  const { session: sessionId } = router.query;
  const [session, setSession] = useState(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!sessionId) return undefined;
    let active = true;

    async function refresh() {
      try {
        const data = await getSession(sessionId);
        if (active) setSession(data);
      } catch (refreshError) {
        if (active) setError(refreshError.message);
      }
    }

    refresh();
    const interval = setInterval(refresh, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [sessionId]);

  async function handleApprove() {
    setApproving(true);
    setError("");
    try {
      setSession(await approveSession(sessionId));
    } catch (approvalError) {
      setError(approvalError.message);
    } finally {
      setApproving(false);
    }
  }

  if (error && !session) {
    return <main className="terminal-state error" role="alert"><h1>Planning service unavailable</h1><p>{error}</p></main>;
  }
  if (!session) return <main className="terminal-state"><h1>Preparing your event plan</h1><p>Checking vendors, availability, and budget guardrails.</p></main>;

  return (
    <div className="dashboard-shell">
      <nav className="site-nav" aria-label="Main navigation">
        <a className="brand" href="/"><span className="brand-mark">L</span>LoopEvent</a>
        <span className="nav-badge">SESSION ACTIVE</span>
      </nav>
      <main className="dashboard-content">
        <a className="back-link" href="/">← Create another event</a>
        <header className="dashboard-header">
          <div>
            <p className="eyebrow">Decision dashboard</p>
            <h1 className="dashboard-title">Your event plan</h1>
            <p className="dashboard-subtitle">Attempt {session.attempts} · {session.request.attendees} guests · {session.request.location}</p>
          </div>
          <span className={`status-chip ${session.status}`}>{session.status.replaceAll("_", " ")}</span>
        </header>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dashboard-grid">
          <ItineraryCard itinerary={session.itinerary} evaluatorResult={session.evaluator_result} />
          <LogPanel logs={session.logs} />
        </div>
        {session.status === "awaiting_approval" && (
          <section className="approval-card">
            <h2>Ready when you are</h2>
            <p>Approve this checked plan to trigger vendor payments and send booking confirmation.</p>
            <ApprovalButton onApprove={handleApprove} disabled={approving} />
          </section>
        )}
        {session.status === "rejected_max_retries" && (
          <section className="evaluation invalid"><strong>Constraints can’t be satisfied</strong>Try raising the budget or adjusting your guest count, then create a new plan.</section>
        )}
        {session.status === "executed" && (
          <section className="evaluation valid"><strong>Event confirmed</strong>Bookings and confirmation messages have been sent.</section>
        )}
      </main>
    </div>
  );
}
