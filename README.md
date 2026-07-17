# LoopEvent

LoopEvent is an autonomous event-planning demo with a deterministic evaluator and a human approval gate. The repository is organized so three contributors can work in parallel behind stable interfaces.

## Workstreams

| Owner | Scope | Primary paths |
|---|---|---|
| A — Backend/Agent | Data contracts, planner/evaluator loop, FastAPI | `backend/models`, `backend/agent`, `backend/main.py` |
| B — Frontend/Security | Next.js UI and Pomerium access | `frontend`, `pomerium` |
| C — Integrations/Deploy | Nexla, Zero.xyz/Twilio, payment webhooks, Akash | `backend/integrations`, `akash` |

The shared boundary is `backend/models/schemas.py`. Integration adapters return or accept those models; callers should not depend on vendor-specific payloads.

## Start locally

1. Copy `.env.example` to `.env` and fill in the needed values.
2. Start everything with `docker compose up --build`.
3. Open the frontend at `http://localhost:3000`, the API docs at `http://localhost:8000/docs`, or the Pomerium-gated app at `http://localhost:8443` after configuring OAuth.

See `LoopEvent_Implementation_Plan.md` for the build order, demo script, and integration notes. See `docs/WORKSTREAMS.md` before splitting work across branches.

