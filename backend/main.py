import logging
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

load_dotenv(Path(__file__).parent.parent / ".env")

from agent.email_drafter import draft_booking_email
from agent.state_machine import execute_approved_session, run_planning_loop
from integrations.nexla_client import get_vendor_quotes
from models.schemas import (
    BookingCard,
    OrganizerSelection,
    PlanRequest,
    PlannerOutput,
    ItineraryItem,
    SessionState,
    VendorQuote,
)

logger = logging.getLogger(__name__)

app = FastAPI(title="LoopEvent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

SESSIONS: dict[str, SessionState] = {}


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Vendor catalogue (for map pins)
# ---------------------------------------------------------------------------

@app.get("/api/vendors")
def list_vendors() -> list[VendorQuote]:
    """Return the full vendor catalogue — used to render map pins."""
    return get_vendor_quotes()


# ---------------------------------------------------------------------------
# Plan creation — now returns vendor options for organizer to choose from
# ---------------------------------------------------------------------------

@app.post("/api/plan")
def create_plan(request: PlanRequest) -> SessionState:
    """
    Start a new planning session.
    Fetches all vendors, filters by capacity, and puts session into
    'awaiting_selection' so the organizer can pick from the map.
    """
    all_vendors = get_vendor_quotes()

    # Filter venues that can handle the attendee count
    venue_options = sorted(
        [v for v in all_vendors if v.category == "venue" and v.available
         and v.capacity >= request.attendees],
        key=lambda v: v.cost_usd,
    )
    # If nothing meets capacity exactly, include all venues sorted cheapest first
    if not venue_options:
        venue_options = sorted(
            [v for v in all_vendors if v.category == "venue" and v.available],
            key=lambda v: v.cost_usd,
        )

    food_options = sorted(
        [v for v in all_vendors if v.category == "food" and v.available],
        key=lambda v: (-v.review_score if v.review_score else 0, v.cost_usd),
    )
    media_options = sorted(
        [v for v in all_vendors if v.category == "media" and v.available],
        key=lambda v: (-v.review_score if v.review_score else 0, v.cost_usd),
    )

    session = SessionState(
        request=request,
        status="awaiting_selection",
        venue_options=venue_options,
        food_options=food_options,
        media_options=media_options,
    )
    session.logs.append(f"[Nexla]: Retrieved {len(all_vendors)} vendor quotes.")
    session.logs.append(
        f"[AI Filter]: {len(venue_options)} venues meet capacity ≥ {request.attendees} guests."
    )
    session.logs.append(
        f"[AI Filter]: {len(food_options)} food vendors and {len(media_options)} media vendors available."
    )
    session.logs.append("[Awaiting organizer]: Please select your preferred vendors on the map.")

    SESSIONS[session.session_id] = session
    return session


# ---------------------------------------------------------------------------
# Organizer submits their vendor selection
# ---------------------------------------------------------------------------

@app.post("/api/session/{session_id}/select")
def submit_selection(session_id: str, selection: OrganizerSelection) -> SessionState:
    """
    Organizer picks venue + food + media from the options panel.
    AI validates the selection against budget and generates email drafts.
    """
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != "awaiting_selection":
        raise HTTPException(status_code=409, detail="Session is not awaiting selection")

    # Resolve selected vendors from the options
    all_options = session.venue_options + session.food_options + session.media_options
    vendor_map: dict[str, VendorQuote] = {v.vendor_id: v for v in all_options}

    selected_vendors: list[VendorQuote] = []
    for vid in [selection.venue_id, selection.food_id, selection.media_id]:
        v = vendor_map.get(vid)
        if not v:
            raise HTTPException(status_code=400, detail=f"Vendor '{vid}' not found in options")
        selected_vendors.append(v)

    total_cost = sum(v.cost_usd for v in selected_vendors)

    session.selection = selection
    session.logs.append(
        f"[Organizer]: Selected — {', '.join(v.name for v in selected_vendors)}"
    )
    session.logs.append(
        f"[Evaluator]: Total cost ${total_cost:,.2f} vs budget ${session.request.budget_usd:,.2f}"
    )

    # Build itinerary from selection (for backward compat)
    session.itinerary = PlannerOutput(
        items=[
            ItineraryItem(
                vendor_id=v.vendor_id,
                category=v.category,
                name=v.name,
                cost_usd=v.cost_usd,
            )
            for v in selected_vendors
        ],
        total_proposed_cost=total_cost,
        notes="Organizer-selected plan",
    )

    # Draft booking emails for each selected vendor
    session.status = "drafting_emails"
    session.logs.append("[AI Agent]: Drafting booking emails for selected vendors...")
    drafts = []
    for vendor in selected_vendors:
        draft = draft_booking_email(session.request, vendor)
        drafts.append(draft)
        session.logs.append(f"[Email Draft]: Composed inquiry email for {vendor.name}.")
    session.email_drafts = drafts

    # Create pending booking cards
    session.booking_cards = [
        BookingCard(
            vendor_id=v.vendor_id,
            vendor_name=v.name,
            category=v.category,
            cost_usd=v.cost_usd,
            address=v.address,
            status="pending",
        )
        for v in selected_vendors
    ]

    session.status = "booking"
    session.logs.append("[System]: Booking emails ready. Awaiting vendor confirmations.")

    return session


# ---------------------------------------------------------------------------
# Simulate vendor confirmation
# ---------------------------------------------------------------------------

@app.post("/api/session/{session_id}/confirm/{vendor_id}")
def confirm_vendor(session_id: str, vendor_id: str) -> SessionState:
    """
    Simulate a vendor confirming the booking.
    The matching booking card flips to 'confirmed'.
    When all vendors confirm, session transitions to 'executed'.
    """
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    confirmed_any = False
    for card in session.booking_cards:
        if card.vendor_id == vendor_id and card.status == "pending":
            card.status = "confirmed"
            card.confirmed_at = datetime.now(timezone.utc).isoformat()
            session.logs.append(f"[Vendor]: {card.vendor_name} confirmed the booking! 🎉")
            confirmed_any = True
            break

    if not confirmed_any:
        raise HTTPException(status_code=404, detail="Vendor booking card not found or already confirmed")

    # If all cards are confirmed → session complete
    if all(c.status == "confirmed" for c in session.booking_cards):
        session.status = "executed"
        session.logs.append("[System]: All vendors confirmed. Event is fully booked! 🎊")

    return session


# ---------------------------------------------------------------------------
# Legacy endpoints (kept for backward compat)
# ---------------------------------------------------------------------------

@app.get("/api/session/{session_id}")
def get_session(session_id: str) -> SessionState:
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@app.post("/api/session/{session_id}/approve")
def approve_session(session_id: str) -> SessionState:
    """Legacy approve endpoint — kept for backward compat."""
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status == "awaiting_approval":
        return execute_approved_session(session)
    return session
