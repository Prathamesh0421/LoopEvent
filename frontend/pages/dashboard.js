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

  if (error && !session) return <main style={{ padding: 40 }} role="alert">{error}</main>;
  if (!session) return <main style={{ padding: 40 }}>Loading session...</main>;

  return (
    <main style={{ padding: 40, maxWidth: 700 }}>
      <h1>Approval Dashboard</h1>
      <p>Status: <strong>{session.status}</strong> (attempt {session.attempts})</p>
      {error && <p role="alert" style={{ color: "red" }}>{error}</p>}
      <ItineraryCard itinerary={session.itinerary} evaluatorResult={session.evaluator_result} />
      <LogPanel logs={session.logs} />
      {session.status === "awaiting_approval" && (
        <ApprovalButton onApprove={handleApprove} disabled={approving} />
      )}
      {session.status === "rejected_max_retries" && (
        <p style={{ color: "red", fontWeight: "bold" }}>
          Could not find a plan within constraints after {session.attempts} attempts.
        </p>
      )}
      {session.status === "executed" && (
        <p style={{ color: "green", fontWeight: "bold" }}>Event booked and confirmed.</p>
      )}
    </main>
  );
}

