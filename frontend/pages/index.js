import { useRouter } from "next/router";

import EventForm from "../components/EventForm";
import { submitPlan } from "../lib/api";

export default function Home() {
  const router = useRouter();

  async function handleSubmit(request) {
    const session = await submitPlan(request);
    // Route to the map/selection page instead of directly to dashboard
    await router.push(`/select?session=${session.session_id}`);
  }

  return (
    <div className="app-shell">
      <nav className="site-nav" aria-label="Main navigation">
        <a className="brand" href="/">
          <span className="brand-mark">L</span>
          LoopEvent
        </a>
        <span className="nav-badge">HUMAN-IN-THE-LOOP</span>
      </nav>

      <main className="hero">
        <section>
          <p className="eyebrow">Autonomous event intelligence</p>
          <h1 className="hero-title">
            Plan the event.<br />
            Keep the <em>final say.</em>
          </h1>
          <p className="hero-copy">
            LoopEvent finds real venues on a live SF map, checks capacity, fetches
            reviews, then lets you hand-pick the best options — before AI drafts
            booking emails and tracks confirmations on your dashboard.
          </p>
          <div className="hero-steps">
            {[
              { n: "01", label: "Scout venues on the map" },
              { n: "02", label: "Pick your favourites" },
              { n: "03", label: "AI drafts booking emails" },
              { n: "04", label: "Track confirmations" },
            ].map(({ n, label }) => (
              <div key={n} className="hero-step">
                <span className="hero-step__num">{n}</span>
                <span className="hero-step__label">{label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="planner-card" aria-labelledby="planner-heading">
          <div className="card-top">
            <h2 className="card-title" id="planner-heading">Start a new event</h2>
            <span className="live-status">READY</span>
          </div>
          <EventForm onSubmit={handleSubmit} />
        </section>
      </main>

      <footer className="trust-strip">
        <span className="trust-label">The planning loop</span>
        <div className="trust-items">
          <span>01. PLAN</span>
          <span>02. SELECT</span>
          <span>03. EMAIL</span>
          <span>04. CONFIRM</span>
        </div>
      </footer>
    </div>
  );
}
