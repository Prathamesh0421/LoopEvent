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
    # New: location + review data
    lat: float | None = None
    lng: float | None = None
    address: str | None = None
    review_score: float | None = None
    review_count: int | None = None
    amenities: list[str] = Field(default_factory=list)
    description: str | None = None


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


class OrganizerSelection(BaseModel):
    """What the organizer picks from the selection panel."""
    venue_id: str
    food_id: str
    media_id: str


class BookingDraft(BaseModel):
    """AI-drafted booking email for a vendor."""
    vendor_id: str
    vendor_name: str
    category: str
    subject: str
    body: str


class BookingCard(BaseModel):
    """A confirmed booking entry shown on the dashboard."""
    card_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    vendor_id: str
    vendor_name: str
    category: str
    cost_usd: float
    address: str | None = None
    status: Literal["pending", "confirmed"] = "pending"
    confirmed_at: str | None = None


SessionStatus = Literal[
    "planning",
    "awaiting_selection",   # new: organizer picks venues
    "awaiting_approval",    # kept for compatibility
    "drafting_emails",      # new: AI is writing booking emails
    "booking",              # new: emails sent, awaiting vendor confirm
    "executed",
    "rejected_max_retries",
]


class SessionState(BaseModel):
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    request: PlanRequest
    status: SessionStatus = "planning"
    attempts: int = 0
    # All options returned for organizer to choose from
    venue_options: list[VendorQuote] = Field(default_factory=list)
    food_options: list[VendorQuote] = Field(default_factory=list)
    media_options: list[VendorQuote] = Field(default_factory=list)
    # What the organizer selected
    selection: OrganizerSelection | None = None
    # The finalized plan (kept for backwards compat)
    itinerary: PlannerOutput | None = None
    evaluator_result: EvaluatorOutput | None = None
    # Email drafts for each selected vendor
    email_drafts: list[BookingDraft] = Field(default_factory=list)
    # Booking cards (appear as vendors confirm)
    booking_cards: list[BookingCard] = Field(default_factory=list)
    logs: list[str] = Field(default_factory=list)
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
