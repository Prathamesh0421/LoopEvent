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
    <form className="event-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        <label className="field-label">
          <span>Guest count <small>PEOPLE</small></span>
          <input className="field-input" type="number" min="1" value={attendees} onChange={(event) => setAttendees(event.target.value)} required />
        </label>
        <label className="field-label">
          <span>Event budget <small>USD</small></span>
          <input className="field-input" type="number" min="1" step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} required />
        </label>
      </div>
      <label className="field-label">
        <span>Where will it happen?</span>
        <input className="field-input" type="text" value={location} onChange={(event) => setLocation(event.target.value)} required />
      </label>
      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? "Finding your best plan..." : "Create event plan"} <span className="button-arrow">→</span>
      </button>
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="form-note">Your plan will be reviewed against availability, capacity, and budget before any booking is made.</p>
    </form>
  );
}
