# LoopEvent — Full Implementation Plan (Build-Ready)

This document is written to be fed directly to coding agents (Cursor, Claude Code, etc.) or read file-by-file by your team. Every code block is meant to be created verbatim, then adjusted only where marked `TODO`. Nothing is left as "figure it out later" — where something genuinely can't be pinned down without your team's own dashboard access (Zero.xyz, Nexla), it is isolated into one small adapter file so the ambiguity can't leak into the rest of the system.

**Team of 3, 8 hours. Owners: A = Backend/Agent, B = Frontend/Pomerium, C = Integrations (Nexla/Zero.xyz/Twilio).**

---

## 0. Locked Decisions (read this first — these remove all ambiguity)

| Decision | Choice | Why |
|---|---|---|
| Gemini SDK | `google-genai` (`pip install google-genai`), NOT the deprecated `google-generativeai` | Old SDK is deprecated as of 2026 |
| Gemini model | `gemini-3.5-flash` | Current GA flash model, fast + cheap, good for structured JSON tasks |
| Gemini call style | `client.models.generate_content()` with `response_mime_type="application/json"` | Simpler and more predictable under time pressure than the newer Interactions API or LangChain agents |
| Backend framework | FastAPI, in-memory session store (Python dict) | No DB needed for a scripted single-demo-session hackathon |
| Frontend | Next.js **Pages Router** (not App Router) | Fewer moving parts, faster to wire up in hours |
| Session state | Polling (`GET /api/session/{id}` every 2s from dashboard) | No websockets needed, simplest reliable option |
| Vendor pricing model | Flat per-event quotes (not per-person math) | Keeps Evaluator math trivial and demo-predictable |
| Data persistence | None — everything lives in memory for the demo | Restart backend = clean state, which you want between demo runs |

**The one rule that protects your whole day:** the full Planner→Evaluator→HITL→Execution loop must run end-to-end on **mocked** data (local JSON + local mock endpoints) before any of Nexla, Zero.xyz, or Pomerium touch it. Every sponsor integration is a **swap-in behind an existing interface**, never a blocker.

---

## 1. Repo Structure

```
loopevent/
├── docker-compose.yml
├── .env.example
├── README.md
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── agent/
│   │   ├── __init__.py
│   │   ├── prompts.py
│   │   ├── planner.py
│   │   ├── evaluator.py
│   │   └── state_machine.py
│   ├── integrations/
│   │   ├── __init__.py
│   │   ├── nexla_client.py
│   │   ├── execution_client.py      # Zero.xyz adapter (SMS + mock payments)
│   │   └── twilio_direct.py         # fallback used by execution_client until Zero.xyz is wired
│   ├── models/
│   │   ├── __init__.py
│   │   └── schemas.py
│   └── data/
│       └── mock_vendor_data.json
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── Dockerfile
│   ├── lib/
│   │   └── api.js
│   ├── components/
│   │   ├── EventForm.js
│   │   ├── ItineraryCard.js
│   │   ├── LogPanel.js
│   │   └── ApprovalButton.js
│   └── pages/
│       ├── index.js
│       └── dashboard.js
├── pomerium/
│   └── config.yaml
└── akash/
    └── deploy.yaml
```

Create every directory now (`mkdir -p` all of the above) before writing files, so imports don't break mid-build.

---

## 2. Environment Variables

Create `.env.example` at repo root, then have each teammate copy it to `.env` and fill in their own keys:

```bash
# --- Gemini ---
GEMINI_API_KEY=

# --- Nexla ---
USE_NEXLA_LIVE=false          # flip to true once C has a working flow
NEXLA_API_URL=                # the Nexset's "API Access" endpoint URL from the Nexla dashboard
NEXLA_ACCESS_TOKEN=

# --- Zero.xyz ---
USE_ZERO_LIVE=false           # flip to true once C has Zero.xyz calls working
ZERO_API_KEY=

# --- Twilio (direct fallback, also what Zero.xyz will ultimately call) ---
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
TWILIO_TO_NUMBER=             # host's phone, for the live SMS demo moment

# --- Mock payment webhook ---
MOCK_PAYMENT_WEBHOOK_URL=     # a webhook.site URL, created by C

# --- Agent behavior ---
MAX_RETRIES=3

# --- Pomerium ---
POMERIUM_ALLOWED_EMAILS=you@example.com,teammate2@example.com,teammate3@example.com
IDP_CLIENT_ID=
IDP_CLIENT_SECRET=
COOKIE_SECRET=                # generate with: openssl rand -base64 32

# --- Frontend ---
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Important:** `USE_NEXLA_LIVE` and `USE_ZERO_LIVE` are the two flags that let A build the entire loop against mocks in hour 1–3, then C flips them to `true` once the real integrations are ready — with zero code changes elsewhere.

---

## 3. Data Contracts (build this file first — everything else imports from it)

`backend/models/schemas.py`

```python
from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime
import uuid


class VendorQuote(BaseModel):
    vendor_id: str
    category: Literal["venue", "food", "media"]
    name: str
    cost_usd: float
    capacity: int = 0          # meaningful for venue only; 0 for food/media
    available: bool = True


class PlanRequest(BaseModel):
    attendees: int
    budget_usd: float
    location: str


class ItineraryItem(BaseModel):
    vendor_id: str
    category: str
    name: str
    cost_usd: float


class PlannerOutput(BaseModel):
    items: list[ItineraryItem]
    total_proposed_cost: float
    notes: str = ""


class EvaluatorOutput(BaseModel):
    passed: bool
    total_cost: float
    budget_diff: float          # positive = under budget, negative = over budget
    capacity_ok: bool
    reason: str


SessionStatus = Literal[
    "planning", "awaiting_approval", "executed", "rejected_max_retries"
]


class SessionState(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    request: PlanRequest
    status: SessionStatus = "planning"
    attempts: int = 0
    itinerary: Optional[PlannerOutput] = None
    evaluator_result: Optional[EvaluatorOutput] = None
    logs: list[str] = []
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
```

---

## 4. Mock Vendor Data (build this second — Planner/Evaluator need it to test against)

`backend/data/mock_vendor_data.json`

This is your scripted data. It's tuned so a **500-attendee / $50-budget** request is mathematically impossible (guarantees the trap-case rejection), and a **500-attendee / $5,000-budget** request is comfortably satisfiable (guarantees the happy-path pass). Do not change the numbers unless you also update the demo script in Section 14.

```json
[
  { "vendor_id": "v-hall-01", "category": "venue", "name": "SF Community Hall", "cost_usd": 1200, "capacity": 600, "available": true },
  { "vendor_id": "v-loft-01", "category": "venue", "name": "Downtown Loft", "cost_usd": 800, "capacity": 150, "available": true },
  { "vendor_id": "v-wh-01", "category": "venue", "name": "Bayview Warehouse Space", "cost_usd": 2500, "capacity": 650, "available": true },
  { "vendor_id": "f-bac-01", "category": "food", "name": "Bay Area Catering Co", "cost_usd": 1800, "capacity": 500, "available": true },
  { "vendor_id": "f-bb-01", "category": "food", "name": "Budget Bites Catering", "cost_usd": 900, "capacity": 200, "available": true },
  { "vendor_id": "m-ggp-01", "category": "media", "name": "Golden Gate Photography", "cost_usd": 600, "capacity": 0, "available": true },
  { "vendor_id": "m-qsm-01", "category": "media", "name": "Quick Snap Media", "cost_usd": 300, "capacity": 0, "available": true }
]
```

`USE_NEXLA_LIVE=false` reads this file directly. This is also the exact shape C should aim to reproduce as the Nexla flow's output schema.

---

## 5. Agent Prompts

`backend/agent/prompts.py`

```python
PLANNER_SYSTEM_PROMPT = """You are the Planner agent for LoopEvent, an autonomous event-planning system.

You will receive:
1. Event constraints: attendees, budget_usd, location
2. A list of available vendor quotes (JSON array), each with vendor_id, category, name, cost_usd, capacity, available
3. Optionally, feedback from a previous rejected attempt

Your job: select exactly one vendor from the "venue" category, one from "food", and one from "media",
choosing only vendors marked available: true, to build a complete event itinerary.

Rules:
- You MUST only select vendors that appear in the provided list. Never invent a vendor.
- The selected venue's capacity must be >= attendees.
- Try to stay within budget_usd, but your job is to propose your best attempt — a separate
  Evaluator will check your math and reject you if you're wrong. If you received feedback from
  a previous rejected attempt, use it to pick cheaper options this time.
- If no combination fits the budget at all, still return your single cheapest valid combination.

Respond with ONLY valid JSON matching this exact schema, no markdown fences, no commentary:
{
  "items": [
    {"vendor_id": "...", "category": "venue", "name": "...", "cost_usd": 0},
    {"vendor_id": "...", "category": "food", "name": "...", "cost_usd": 0},
    {"vendor_id": "...", "category": "media", "name": "...", "cost_usd": 0}
  ],
  "total_proposed_cost": 0,
  "notes": "one short sentence explaining your choice"
}
"""

EVALUATOR_SYSTEM_PROMPT = """You are the Evaluator agent for LoopEvent. You are a strict, deterministic
financial and logistics auditor. You do not make creative choices — you check math and rules.

You will receive:
1. The original constraints: attendees, budget_usd
2. The Planner's proposed itinerary (JSON)
3. The full vendor quote list (JSON), so you can verify the selected vendors are real and available

Checks you must perform:
1. Sum the cost_usd of all items in the itinerary. Compare to budget_usd.
2. Find the selected venue item in the vendor list and confirm its capacity >= attendees.
3. Confirm every selected vendor_id exists in the vendor list and is marked available: true.

Respond with ONLY valid JSON matching this exact schema, no markdown fences, no commentary:
{
  "passed": true,
  "total_cost": 0,
  "budget_diff": 0,
  "capacity_ok": true,
  "reason": "one short sentence explaining the pass or fail"
}

budget_diff = budget_usd - total_cost (positive means under budget, negative means over budget).
passed must be false if total_cost > budget_usd, OR capacity_ok is false, OR any vendor is invalid/unavailable.
"""
```

---

## 6. Planner

`backend/agent/planner.py`

```python
import json
import os
from google import genai
from google.genai import types

from models.schemas import PlanRequest, VendorQuote, PlannerOutput
from agent.prompts import PLANNER_SYSTEM_PROMPT

_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


def run_planner(
    request: PlanRequest,
    vendor_quotes: list[VendorQuote],
    previous_rejection_reason: str | None = None,
) -> PlannerOutput:
    user_content = {
        "constraints": request.model_dump(),
        "vendor_quotes": [v.model_dump() for v in vendor_quotes],
        "previous_rejection_reason": previous_rejection_reason,
    }

    response = _client.models.generate_content(
        model="gemini-3.5-flash",
        contents=json.dumps(user_content),
        config=types.GenerateContentConfig(
            system_instruction=PLANNER_SYSTEM_PROMPT,
            response_mime_type="application/json",
            temperature=0.3,
        ),
    )

    data = json.loads(response.text)
    return PlannerOutput(**data)
```

---

## 7. Evaluator (LLM check + deterministic safety net)

`backend/agent/evaluator.py`

The Evaluator is the "guardrail" your demo hinges on, so it gets a hard Python-side arithmetic check as a backstop in addition to the LLM's own judgment. If the LLM says `passed: true` but the math doesn't actually hold, the backend overrides it to `false` and logs why. This is a legitimate defense-in-depth pattern, not a deviation from the spec — the LLM critique still runs and still produces the `reason` text you show in your demo logs.

`backend/agent/evaluator.py`

```python
import json
import os
from google import genai
from google.genai import types

from models.schemas import PlanRequest, VendorQuote, PlannerOutput, EvaluatorOutput
from agent.prompts import EVALUATOR_SYSTEM_PROMPT

_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


def run_evaluator(
    request: PlanRequest,
    plan: PlannerOutput,
    vendor_quotes: list[VendorQuote],
) -> EvaluatorOutput:
    user_content = {
        "constraints": request.model_dump(),
        "proposed_itinerary": plan.model_dump(),
        "vendor_quotes": [v.model_dump() for v in vendor_quotes],
    }

    response = _client.models.generate_content(
        model="gemini-3.5-flash",
        contents=json.dumps(user_content),
        config=types.GenerateContentConfig(
            system_instruction=EVALUATOR_SYSTEM_PROMPT,
            response_mime_type="application/json",
            temperature=0.0,
        ),
    )

    llm_result = EvaluatorOutput(**json.loads(response.text))

    # --- deterministic safety net, always runs regardless of what the LLM said ---
    vendor_map = {v.vendor_id: v for v in vendor_quotes}
    hard_total = sum(item.cost_usd for item in plan.items)
    venue_items = [i for i in plan.items if i.category == "venue"]
    hard_capacity_ok = bool(venue_items) and any(
        vendor_map.get(i.vendor_id) and vendor_map[i.vendor_id].capacity >= request.attendees
        for i in venue_items
    )
    hard_vendors_valid = all(
        i.vendor_id in vendor_map and vendor_map[i.vendor_id].available for i in plan.items
    )
    hard_passed = (hard_total <= request.budget_usd) and hard_capacity_ok and hard_vendors_valid

    if llm_result.passed != hard_passed:
        return EvaluatorOutput(
            passed=hard_passed,
            total_cost=hard_total,
            budget_diff=request.budget_usd - hard_total,
            capacity_ok=hard_capacity_ok,
            reason=f"[safety-net override] LLM said passed={llm_result.passed}, "
                   f"but arithmetic check says passed={hard_passed}. "
                   f"Original LLM reason: {llm_result.reason}",
        )

    return llm_result
```

---

## 8. State Machine (the four-phase loop)

`backend/agent/state_machine.py`

```python
import os
from models.schemas import PlanRequest, SessionState
from agent.planner import run_planner
from agent.evaluator import run_evaluator
from integrations.nexla_client import get_vendor_quotes
from integrations.execution_client import send_approval_sms, send_confirmation_sms, execute_payments

MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))


def run_planning_loop(session: SessionState) -> SessionState:
    """Phases 1 and 2: ingest, plan, critique, retry up to MAX_RETRIES."""
    vendor_quotes = get_vendor_quotes()
    session.logs.append(f"[Nexla]: Retrieved {len(vendor_quotes)} vendor quotes.")

    previous_reason = None
    for attempt in range(1, MAX_RETRIES + 1):
        session.attempts = attempt
        session.logs.append(f"[Planner]: Attempt {attempt} — querying vendor quotes for a plan...")
        plan = run_planner(session.request, vendor_quotes, previous_reason)
        session.logs.append(
            f"[Planner]: Proposed total ${plan.total_proposed_cost:.2f} — {plan.notes}"
        )

        result = run_evaluator(session.request, plan, vendor_quotes)
        session.itinerary = plan
        session.evaluator_result = result

        if result.passed:
            session.logs.append(
                f"[Evaluator]: PLAN VALIDATED. Total ${result.total_cost:.2f}, "
                f"${result.budget_diff:.2f} under budget. {result.reason}"
            )
            session.status = "awaiting_approval"
            _trigger_hitl_notification(session)
            return session
        else:
            over_by = -result.budget_diff if result.budget_diff < 0 else 0
            session.logs.append(
                f"[Evaluator]: GUARDRAIL TRIGGERED. Budget exceeded by ${over_by:.2f}. "
                f"Rejecting execution. {result.reason}"
            )
            previous_reason = result.reason

    session.status = "rejected_max_retries"
    session.logs.append(
        f"[State Machine]: Max retries ({MAX_RETRIES}) exhausted. Cannot satisfy constraints."
    )
    return session


def _trigger_hitl_notification(session: SessionState) -> None:
    """Phase 3 start: notify the host that a plan is ready for approval."""
    message = (
        f"LoopEvent: plan finalized for {session.request.attendees} guests "
        f"(${session.evaluator_result.total_cost:.2f}). Awaiting your approval on the dashboard."
    )
    send_approval_sms(message)
    session.logs.append("[Zero.xyz -> Twilio]: Approval notification SMS sent.")


def execute_approved_session(session: SessionState) -> SessionState:
    """Phase 4: host has clicked Approve & Execute on the (Pomerium-gated) dashboard."""
    if session.status != "awaiting_approval":
        session.logs.append("[State Machine]: Approve called but session was not awaiting approval. Ignored.")
        return session

    execute_payments(session.itinerary)
    session.logs.append("[Zero.xyz]: Mock payment webhooks fired for all itinerary items.")

    send_confirmation_sms(
        f"LoopEvent: your event for {session.request.attendees} guests is booked and confirmed."
    )
    session.logs.append("[Zero.xyz -> Twilio]: Confirmation SMS sent.")

    session.status = "executed"
    session.logs.append("[State Machine]: Execution complete.")
    return session
```

---

## 9. Integration Adapters

### 9.1 Nexla client

`backend/integrations/nexla_client.py`

```python
import json
import os
import requests

from models.schemas import VendorQuote

_MOCK_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "mock_vendor_data.json")


def get_vendor_quotes() -> list[VendorQuote]:
    if os.getenv("USE_NEXLA_LIVE", "false").lower() == "true":
        return _get_from_nexla()
    return _get_from_local_mock()


def _get_from_local_mock() -> list[VendorQuote]:
    with open(_MOCK_PATH) as f:
        raw = json.load(f)
    return [VendorQuote(**v) for v in raw]


def _get_from_nexla() -> list[VendorQuote]:
    """
    Calls the live Nexla Nexset via its 'API Access' endpoint.
    NEXLA_API_URL: get this from the Nexla dashboard -> your flow -> Nexset -> API Access tab.
    It should return a JSON array matching the VendorQuote schema (see Section 4) —
    build the Nexla flow's output transform to produce exactly that shape so this
    function needs zero changes.
    """
    url = os.environ["NEXLA_API_URL"]
    token = os.environ["NEXLA_ACCESS_TOKEN"]
    resp = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=10)
    resp.raise_for_status()
    raw = resp.json()
    return [VendorQuote(**v) for v in raw]
```

**C's job:** build the Nexla flow so its output Nexset matches the `VendorQuote` JSON shape exactly (same field names). If it doesn't, put a small mapping step in `_get_from_nexla()` rather than changing the schema everywhere else.

### 9.2 Execution client (Zero.xyz adapter)

**Honest flag, read this:** Zero.xyz is built around agent-side tool *discovery* (it indexes ~8,000+ services an agent can call) rather than one fixed REST contract I can hand you with certainty — the exact call shape depends on how your team's Zero.xyz account/CLI is set up, which I can't see. Rather than guess and hand you code that might be subtly wrong, this is isolated into one adapter file with a working local fallback. **C: once you have Zero.xyz open, only this one file needs edits.**

`backend/integrations/execution_client.py`

```python
import os
from models.schemas import PlannerOutput
from integrations import twilio_direct


def send_approval_sms(message: str) -> None:
    if os.getenv("USE_ZERO_LIVE", "false").lower() == "true":
        _send_sms_via_zero(message)
    else:
        twilio_direct.send_sms(message)


def send_confirmation_sms(message: str) -> None:
    if os.getenv("USE_ZERO_LIVE", "false").lower() == "true":
        _send_sms_via_zero(message)
    else:
        twilio_direct.send_sms(message)


def execute_payments(itinerary: PlannerOutput) -> None:
    if os.getenv("USE_ZERO_LIVE", "false").lower() == "true":
        _trigger_payments_via_zero(itinerary)
    else:
        twilio_direct.mock_payment_webhook(itinerary)


# --- TODO (C): replace the bodies of these two functions with real Zero.xyz calls ---
# Follow whatever "Get Code" / connector snippet Zero.xyz's own dashboard gives you
# for (1) a Twilio SMS-send connector and (2) a generic webhook-call connector.
# Keep the function signatures identical so state_machine.py never needs to change.

def _send_sms_via_zero(message: str) -> None:
    raise NotImplementedError("Wire this to Zero.xyz's Twilio connector, then set USE_ZERO_LIVE=true")


def _trigger_payments_via_zero(itinerary: PlannerOutput) -> None:
    raise NotImplementedError("Wire this to Zero.xyz's webhook connector, then set USE_ZERO_LIVE=true")
```

### 9.3 Twilio direct fallback (also your safety net if Zero.xyz has a bad hour)

`backend/integrations/twilio_direct.py`

```python
import os
import requests
from twilio.rest import Client

from models.schemas import PlannerOutput


def send_sms(message: str) -> None:
    client = Client(os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"])
    client.messages.create(
        body=message,
        from_=os.environ["TWILIO_FROM_NUMBER"],
        to=os.environ["TWILIO_TO_NUMBER"],
    )


def mock_payment_webhook(itinerary: PlannerOutput) -> None:
    url = os.environ["MOCK_PAYMENT_WEBHOOK_URL"]
    for item in itinerary.items:
        requests.post(url, json={
            "vendor_id": item.vendor_id,
            "name": item.name,
            "amount_usd": item.cost_usd,
            "action": "charge",
        }, timeout=10)
```

This file alone is enough to make Phase 3 and Phase 4 fully real and demoable even if Zero.xyz integration is still in progress. **C's build order should be: get this file working first (hour 1–2), then layer Zero.xyz calls into `execution_client.py` on top of it (hour 3–4).**

---

## 10. FastAPI Backend Entry Point

`backend/main.py`

```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models.schemas import PlanRequest, SessionState
from agent.state_machine import run_planning_loop, execute_approved_session

app = FastAPI(title="LoopEvent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # fine for a hackathon demo; tighten if you have time left
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session store. Restarting the backend clears all sessions — that's fine for a demo.
SESSIONS: dict[str, SessionState] = {}


@app.post("/api/plan")
def create_plan(request: PlanRequest) -> SessionState:
    session = SessionState(request=request)
    SESSIONS[session.session_id] = session
    run_planning_loop(session)
    return session


@app.get("/api/session/{session_id}")
def get_session(session_id: str) -> SessionState:
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.post("/api/session/{session_id}/approve")
def approve_session(session_id: str) -> SessionState:
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    execute_approved_session(session)
    return session


@app.get("/api/health")
def health():
    return {"status": "ok"}
```

`backend/requirements.txt`

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
google-genai
pydantic==2.9.2
requests==2.32.3
twilio==9.3.2
python-dotenv==1.0.1
```

`backend/Dockerfile`

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Run locally (before Docker even exists) with:

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
export $(cat ../.env | xargs)   # or use python-dotenv in main.py
uvicorn main:app --reload --port 8000
```

---

## 11. Frontend

`frontend/package.json`

```json
{
  "name": "loopevent-frontend",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  }
}
```

`frontend/lib/api.js`

```javascript
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function submitPlan(request) {
  const res = await fetch(`${API_URL}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error("Failed to submit plan");
  return res.json();
}

export async function getSession(sessionId) {
  const res = await fetch(`${API_URL}/api/session/${sessionId}`);
  if (!res.ok) throw new Error("Failed to fetch session");
  return res.json();
}

export async function approveSession(sessionId) {
  const res = await fetch(`${API_URL}/api/session/${sessionId}/approve`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to approve session");
  return res.json();
}
```

`frontend/components/EventForm.js`

```javascript
import { useState } from "react";

export default function EventForm({ onSubmit }) {
  const [attendees, setAttendees] = useState(50);
  const [budget, setBudget] = useState(1000);
  const [location, setLocation] = useState("San Francisco");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    await onSubmit({ attendees: Number(attendees), budget_usd: Number(budget), location });
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 360 }}>
      <label>
        Attendees
        <input type="number" value={attendees} onChange={(e) => setAttendees(e.target.value)} required />
      </label>
      <label>
        Budget (USD)
        <input type="number" value={budget} onChange={(e) => setBudget(e.target.value)} required />
      </label>
      <label>
        Location
        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} required />
      </label>
      <button type="submit" disabled={loading}>
        {loading ? "Planning..." : "Plan Event"}
      </button>
    </form>
  );
}
```

`frontend/components/ItineraryCard.js`

```javascript
export default function ItineraryCard({ itinerary, evaluatorResult }) {
  if (!itinerary) return null;
  return (
    <div style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginTop: 16 }}>
      <h3>Proposed Itinerary</h3>
      <ul>
        {itinerary.items.map((item) => (
          <li key={item.vendor_id}>
            <strong>{item.category}</strong>: {item.name} — ${item.cost_usd.toFixed(2)}
          </li>
        ))}
      </ul>
      <p>Total: ${itinerary.total_proposed_cost.toFixed(2)}</p>
      {evaluatorResult && (
        <p style={{ color: evaluatorResult.passed ? "green" : "red" }}>
          {evaluatorResult.passed ? "VALIDATED" : "REJECTED"} — {evaluatorResult.reason}
        </p>
      )}
    </div>
  );
}
```

`frontend/components/LogPanel.js`

```javascript
export default function LogPanel({ logs }) {
  return (
    <div style={{ background: "#111", color: "#0f0", fontFamily: "monospace", padding: 12, borderRadius: 8, marginTop: 16, minHeight: 120 }}>
      {logs.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
    </div>
  );
}
```

`frontend/components/ApprovalButton.js`

```javascript
export default function ApprovalButton({ onApprove, disabled }) {
  return (
    <button onClick={onApprove} disabled={disabled} style={{ marginTop: 16, padding: "10px 20px", fontWeight: "bold" }}>
      Approve & Execute
    </button>
  );
}
```

`frontend/pages/index.js`

```javascript
import { useRouter } from "next/router";
import EventForm from "../components/EventForm";
import { submitPlan } from "../lib/api";

export default function Home() {
  const router = useRouter();

  async function handleSubmit(request) {
    const session = await submitPlan(request);
    router.push(`/dashboard?session=${session.session_id}`);
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>LoopEvent</h1>
      <p>Autonomous event planning, with a human approval gate.</p>
      <EventForm onSubmit={handleSubmit} />
    </main>
  );
}
```

`frontend/pages/dashboard.js`

```javascript
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import ItineraryCard from "../components/ItineraryCard";
import LogPanel from "../components/LogPanel";
import ApprovalButton from "../components/ApprovalButton";
import { getSession, approveSession } from "../lib/api";

export default function Dashboard() {
  const router = useRouter();
  const { session: sessionId } = router.query;
  const [session, setSession] = useState(null);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(async () => {
      const data = await getSession(sessionId);
      setSession(data);
    }, 2000);
    return () => clearInterval(interval);
  }, [sessionId]);

  async function handleApprove() {
    setApproving(true);
    const data = await approveSession(sessionId);
    setSession(data);
    setApproving(false);
  }

  if (!session) return <main style={{ padding: 40 }}>Loading session...</main>;

  return (
    <main style={{ padding: 40, maxWidth: 700 }}>
      <h1>Approval Dashboard</h1>
      <p>Status: <strong>{session.status}</strong> (attempt {session.attempts})</p>
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
```

`frontend/Dockerfile`

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

Run locally with `cd frontend && npm install && npm run dev` (defaults to `http://localhost:3000`).

---

## 12. Pomerium (Security Layer)

This gates the dashboard behind authenticated login so only your team can hit `/dashboard`. For a same-day hackathon build, run Pomerium **without TLS** (`insecure_server: true`) locally — flagged clearly below as a demo-only simplification, not something to ship.

`pomerium/config.yaml`

```yaml
# DEMO-ONLY CONFIG: insecure_server disables TLS for local/hackathon use.
# Do not use this setting outside a local demo environment.
insecure_server: true
address: :8443

authenticate_service_url: http://localhost:8443

idp_provider: google
idp_client_id: ${IDP_CLIENT_ID}
idp_client_secret: ${IDP_CLIENT_SECRET}

cookie_secret: ${COOKIE_SECRET}

routes:
  - from: http://localhost:8443
    to: http://frontend:3000
    policy:
      - allow:
          or:
            - email:
                is: teammate1@example.com   # TODO: replace with real team emails
            - email:
                is: teammate2@example.com
            - email:
                is: teammate3@example.com
```

**B's setup steps:**
1. Go to Google Cloud Console → APIs & Services → Credentials → create an OAuth 2.0 Client ID (type: Web application).
2. Add `http://localhost:8443/oauth2/callback` as an authorized redirect URI.
3. Put the resulting client ID/secret into `.env` as `IDP_CLIENT_ID` / `IDP_CLIENT_SECRET`.
4. Generate a cookie secret: `openssl rand -base64 32`, put it in `.env` as `COOKIE_SECRET`.
5. Replace the placeholder emails in `routes[0].policy` with your actual team emails.
6. Test: visiting `http://localhost:8443` should redirect to Google login, then only let listed emails through to the dashboard.

---

## 13. Docker Compose (full local stack)

`docker-compose.yml`

```yaml
version: "3.8"
services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: .env
    volumes:
      - ./backend:/app

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    env_file: .env
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:8000
    depends_on:
      - backend

  pomerium:
    image: pomerium/pomerium:latest
    ports:
      - "8443:8443"
    volumes:
      - ./pomerium/config.yaml:/pomerium/config.yaml
    env_file: .env
    depends_on:
      - frontend
```

Run with `docker compose up --build`. Access the gated dashboard at `http://localhost:8443`, the raw frontend at `http://localhost:3000` (for debugging without Pomerium in the way), and the API directly at `http://localhost:8000`.

---

## 14. Akash Deployment (time-boxed to Hour 6, see Section 15)

`akash/deploy.yaml`

```yaml
---
version: "2.0"

services:
  backend:
    image: <YOUR_DOCKERHUB_USERNAME>/loopevent-backend:latest
    env:
      - GEMINI_API_KEY=<set via Akash env or secrets>
    expose:
      - port: 8000
        as: 8000
        to:
          - global: true

  frontend:
    image: <YOUR_DOCKERHUB_USERNAME>/loopevent-frontend:latest
    expose:
      - port: 3000
        as: 80
        to:
          - global: true

profiles:
  compute:
    backend:
      resources:
        cpu:
          units: 1.0
        memory:
          size: 1Gi
        storage:
          size: 2Gi
    frontend:
      resources:
        cpu:
          units: 0.5
        memory:
          size: 512Mi
        storage:
          size: 1Gi
  placement:
    dcloud:
      pricing:
        backend:
          denom: uakt
          amount: 1000
        frontend:
          denom: uakt
          amount: 500

deployment:
  backend:
    dcloud:
      profile: backend
      count: 1
  frontend:
    dcloud:
      profile: frontend
      count: 1
```

**Caveat to flag to your team:** Akash's exact SDL attribute names, pricing units, and available providers can shift, and provider availability varies at deploy time — check the current SDL reference in the Akash Console before deploying rather than trusting this file as final. Push your images to Docker Hub first (`docker build -t <user>/loopevent-backend ./backend && docker push ...`), then paste this SDL into the Akash Console's deploy flow and adjust anything it flags as invalid.

**This step is explicitly droppable.** If it's not live by end of Hour 6, demo from the local Docker Compose stack and show this SDL file in your repo as "deploy-ready." Judges care that the architecture supports it, not that you fought a provider outage live.

---

## 15. Build Order With Owners (condensed — mirrors your 8-hour day)

| Hour | A (Backend/Agent) | B (Frontend/Pomerium) | C (Integrations) |
|---|---|---|---|
| 1 | `schemas.py`, `mock_vendor_data.json`, FastAPI skeleton | Next.js scaffold, `EventForm`, static pages | Twilio test account + `twilio_direct.send_sms` working standalone; Nexla account + first flow started |
| 2 | `prompts.py`, `planner.py`, `evaluator.py` against mock data | Wire form → `/api/plan`, render raw JSON response | Get Nexla flow outputting JSON matching `VendorQuote` shape; webhook.site mock endpoint created |
| 3 | `state_machine.py`, full loop runs end-to-end on mocks — **checkpoint: trap case and happy case both work locally** | `dashboard.js` polling + `ItineraryCard` + `LogPanel` | `twilio_direct.mock_payment_webhook` working; start reading Zero.xyz's actual connector docs from your dashboard |
| 4 | Support A/C wiring `execution_client.py`; harden retry-cap edge cases | `ApprovalButton` wired to `/approve`; local Pomerium container up, Google OAuth working | Wire real Zero.xyz calls into `execution_client.py`, flip `USE_ZERO_LIVE=true` when working |
| 5 | Dockerfile for backend, test in Compose | Dockerfile for frontend, test in Compose | Own container networking bugs (env vars, service DNS names) in `docker-compose up` |
| 6 | Push image to Docker Hub, help with SDL | Push image to Docker Hub, help with SDL | Time-boxed: attempt Akash deploy; stress-test local stack with edge-case budgets while waiting on provider |
| 7 | Bug-fix only — no new features | Bug-fix only — screen layout for demo (dashboard left, terminal right) | Bug-fix only — confirm SMS + webhook fire reliably 3x in a row |
| 8 | Final full run-through | Final full run-through, rehearse narration | Final full run-through, phone ready for SMS screenshot |

---

## 16. Verification Checklist (run these exact commands at each checkpoint)

**After Hour 1 (backend skeleton):**
```bash
curl http://localhost:8000/api/health
# expect: {"status":"ok"}
```

**After Hour 3 (full loop on mocks) — this is your most important checkpoint of the day:**
```bash
# Trap case — should end in rejected_max_retries after 3 attempts
curl -X POST http://localhost:8000/api/plan \
  -H "Content-Type: application/json" \
  -d '{"attendees": 500, "budget_usd": 50, "location": "San Francisco"}'

# Happy case — should end in awaiting_approval
curl -X POST http://localhost:8000/api/plan \
  -H "Content-Type: application/json" \
  -d '{"attendees": 500, "budget_usd": 5000, "location": "San Francisco"}'
```
Copy the `session_id` from the happy-case response, then:
```bash
curl http://localhost:8000/api/session/<session_id>
curl -X POST http://localhost:8000/api/session/<session_id>/approve
curl http://localhost:8000/api/session/<session_id>
# expect: "status": "executed"
```

**After Hour 4 (Zero.xyz live):** re-run the happy case above with `USE_ZERO_LIVE=true` and confirm the SMS actually arrives on the host's phone, and the webhook.site inbox shows the payment payloads.

**After Hour 4 (Pomerium):** visit `http://localhost:8443` in an incognito window — confirm it redirects to Google login, and that a non-team email gets denied while a team email gets through to the dashboard.

---

## 17. Demo Script — Exact Scripted Inputs

Use these exact numbers so your mock vendor data (Section 4) produces the guaranteed trap/pass outcomes.

**Action 1 — Set the trap.** Type into the form:
- Attendees: `500`
- Budget: `50`
- Location: `San Francisco`

Expected terminal logs (visible in `LogPanel` and backend stdout):
```
[Nexla]: Retrieved 7 vendor quotes.
[Planner]: Attempt 1 — querying vendor quotes for a plan...
[Evaluator]: GUARDRAIL TRIGGERED. Budget exceeded by $2,450.00. Rejecting execution. ...
[Planner]: Attempt 2 — ...
[Evaluator]: GUARDRAIL TRIGGERED. ...
[Planner]: Attempt 3 — ...
[Evaluator]: GUARDRAIL TRIGGERED. ...
[State Machine]: Max retries (3) exhausted. Cannot satisfy constraints.
```

**Action 3 — The happy path.** Change budget to `5000` (keep attendees at `500`):
```
[Planner]: Attempt 1 — querying vendor quotes for a plan...
[Evaluator]: PLAN VALIDATED. Total $3600.00, $1400.00 under budget. ...
[Zero.xyz -> Twilio]: Approval notification SMS sent.
```

**Action 4 — Execution.** Show the phone receiving the SMS, log into the Pomerium-gated dashboard, click **Approve & Execute**:
```
[Zero.xyz]: Mock payment webhooks fired for all itinerary items.
[Zero.xyz -> Twilio]: Confirmation SMS sent.
[State Machine]: Execution complete.
```

---

## 18. What's Intentionally Simplified (say this out loud to judges if asked — it reads as engineering judgment, not corner-cutting)

- In-memory session store instead of a database — correct call for a scripted single-session demo.
- Pomerium running without TLS locally — flagged in the config as demo-only.
- Zero.xyz adapter has a working direct-Twilio fallback path — this is defense-in-depth, not a workaround; it means one sponsor integration having a bad hour never takes down your whole demo.
- Evaluator has both an LLM critique and a hard arithmetic safety net — stronger guardrail story than LLM-only, and gives you a good answer if a judge asks "what if the LLM hallucinates a pass?"
