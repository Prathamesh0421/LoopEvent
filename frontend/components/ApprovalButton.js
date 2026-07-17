export default function ApprovalButton({ onApprove, disabled }) {
  return (
    <button onClick={onApprove} disabled={disabled} style={{ marginTop: 16, padding: "10px 20px", fontWeight: "bold" }}>
      {disabled ? "Executing..." : "Approve & Execute"}
    </button>
  );
}

