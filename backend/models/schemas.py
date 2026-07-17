from datetime import datetime, timezone
from typing import Literal
import uuid

from pydantic import BaseModel, Field


class VendorQuote(BaseModel):
    vendor_id: str
    category: Literal["venue", "food", "media"]
    name: str
    cost_usd: float
    capacity: int = 0
    available: bool = True


class PlanRequest(BaseModel):
    attendees: int = Field(gt=0)
    budget_usd: float = Field(gt=0)
    location: str = Field(min_length=1)


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
    budget_diff: float
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
    itinerary: PlannerOutput | None = None
    evaluator_result: EvaluatorOutput | None = None
    logs: list[str] = Field(default_factory=list)
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

