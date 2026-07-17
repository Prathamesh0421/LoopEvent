import { useRouter } from "next/router";

import EventForm from "../components/EventForm";
import { submitPlan } from "../lib/api";

export default function Home() {
  const router = useRouter();

  async function handleSubmit(request) {
    const session = await submitPlan(request);
    await router.push(`/dashboard?session=${session.session_id}`);
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
          <h1 className="hero-title">Plan the event.<br />Keep the <em>final say.</em></h1>
          <p className="hero-copy">
            LoopEvent sources vendors, checks the numbers, and creates a complete event plan—then waits for your approval before anything happens.
          </p>
          <div className="hero-points" aria-label="LoopEvent guarantees">
            <span><i />Budget guardrails</span>
            <span><i />Capacity checks</span>
            <span><i />Approval required</span>
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
        <div className="trust-items"><span>01. PLAN</span><span>02. VERIFY</span><span>03. APPROVE</span><span>04. EXECUTE</span></div>
      </footer>
    </div>
  );
}
