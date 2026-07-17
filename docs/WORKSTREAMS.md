# Parallel work guide

Start feature branches from the same scaffold commit and keep edits inside the assigned boundary whenever possible.

## Shared interfaces

- `backend/models/schemas.py` is the source of truth for API and adapter data.
- `backend/integrations/nexla_client.py#get_vendor_quotes` must return `list[VendorQuote]`.
- `backend/integrations/execution_client.py` owns all execution side effects.
- The frontend communicates only through the functions in `frontend/lib/api.js`.
- Environment variable names are defined in `.env.example`.

Changes to a shared interface should land first in a small coordination change before dependent work is merged.

## Suggested branches

- `codex/backend-agent`
- `codex/frontend-security`
- `codex/integrations-deploy`

## Integration order

1. Merge shared contracts and mock-data changes.
2. Merge backend API and agent loop.
3. Merge frontend against the stable API contract.
4. Merge live adapters behind `USE_NEXLA_LIVE` and `USE_ZERO_LIVE`.
5. Validate the mock path before enabling any live integration.

