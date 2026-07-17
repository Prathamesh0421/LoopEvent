const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function connectionError() {
  return new Error(
    "We can't reach the planning service. Start the backend on port 8000, then try again."
  );
}

async function parseResponse(response, fallbackMessage) {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || fallbackMessage);
  }
  return response.json();
}

export async function submitPlan(request) {
  try {
    const response = await fetch(`${API_URL}/api/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    return parseResponse(response, "We couldn't create a plan. Please try again.");
  } catch (error) {
    if (error instanceof TypeError) throw connectionError();
    throw error;
  }
}

export async function getSession(sessionId) {
  try {
    const response = await fetch(`${API_URL}/api/session/${sessionId}`);
    return parseResponse(response, "We couldn't refresh this event session.");
  } catch (error) {
    if (error instanceof TypeError) throw connectionError();
    throw error;
  }
}

export async function listVendors() {
  try {
    const response = await fetch(`${API_URL}/api/vendors`);
    return parseResponse(response, "Couldn't load vendor catalogue.");
  } catch (error) {
    if (error instanceof TypeError) throw connectionError();
    throw error;
  }
}

export async function submitSelection(sessionId, selection) {
  try {
    const response = await fetch(`${API_URL}/api/session/${sessionId}/select`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selection),
    });
    return parseResponse(response, "Couldn't submit your vendor selection.");
  } catch (error) {
    if (error instanceof TypeError) throw connectionError();
    throw error;
  }
}

export async function confirmVendor(sessionId, vendorId) {
  try {
    const response = await fetch(
      `${API_URL}/api/session/${sessionId}/confirm/${vendorId}`,
      { method: "POST" }
    );
    return parseResponse(response, "Couldn't confirm vendor booking.");
  } catch (error) {
    if (error instanceof TypeError) throw connectionError();
    throw error;
  }
}

export async function approveSession(sessionId) {
  try {
    const response = await fetch(`${API_URL}/api/session/${sessionId}/approve`, {
      method: "POST",
    });
    return parseResponse(response, "We couldn't approve this plan. Please try again.");
  } catch (error) {
    if (error instanceof TypeError) throw connectionError();
    throw error;
  }
}
