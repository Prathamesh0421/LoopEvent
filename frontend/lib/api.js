const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function parseResponse(response, fallbackMessage) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || fallbackMessage);
  }
  return response.json();
}

export async function submitPlan(request) {
  const response = await fetch(`${API_URL}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return parseResponse(response, "Failed to submit plan");
}

export async function getSession(sessionId) {
  const response = await fetch(`${API_URL}/api/session/${sessionId}`);
  return parseResponse(response, "Failed to fetch session");
}

export async function approveSession(sessionId) {
  const response = await fetch(`${API_URL}/api/session/${sessionId}/approve`, {
    method: "POST",
  });
  return parseResponse(response, "Failed to approve session");
}

