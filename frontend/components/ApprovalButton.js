export default function ApprovalButton({ onApprove, disabled }) {
  return (
    <button className="primary-button approval-button" onClick={onApprove} disabled={disabled}>
      {disabled ? "Confirming bookings..." : "Approve & execute plan"} <span className="button-arrow">→</span>
    </button>
  );
}
