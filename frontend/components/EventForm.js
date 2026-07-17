import { useState } from "react";

export default function EventForm({ onSubmit }) {
  const [attendees, setAttendees] = useState(50);
  const [budget, setBudget] = useState(1000);
  const [location, setLocation] = useState("San Francisco");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await onSubmit({
        attendees: Number(attendees),
        budget_usd: Number(budget),
        location,
      });
    } catch (submissionError) {
      setError(submissionError.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360 }}>
      <label>
        Attendees
        <input type="number" min="1" value={attendees} onChange={(event) => setAttendees(event.target.value)} required />
      </label>
      <label>
        Budget (USD)
        <input type="number" min="1" step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} required />
      </label>
      <label>
        Location
        <input type="text" value={location} onChange={(event) => setLocation(event.target.value)} required />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? "Planning..." : "Plan Event"}
      </button>
      {error && <p role="alert" style={{ color: "red" }}>{error}</p>}
    </form>
  );
}

