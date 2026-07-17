import json
import os
import logging

from google import genai
from google.genai import types

from models.schemas import PlanRequest, PlannerOutput, VendorQuote, ItineraryItem
from agent.prompts import PLANNER_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


def _mock_planner_output(request: PlanRequest, vendor_quotes: list[VendorQuote]) -> PlannerOutput:
    """Fallback planner: try every valid combination and pick the cheapest one within budget.
    If nothing fits, pick the cheapest valid combination overall."""

    venues = sorted(
        [v for v in vendor_quotes if v.category == "venue" and v.available and v.capacity >= request.attendees],
        key=lambda v: v.cost_usd,
    )
    if not venues:
        # no venue meets capacity – use cheapest available venue regardless
        venues = sorted(
            [v for v in vendor_quotes if v.category == "venue" and v.available],
            key=lambda v: v.cost_usd,
        )

    foods = sorted([v for v in vendor_quotes if v.category == "food" and v.available], key=lambda v: v.cost_usd)
    medias = sorted([v for v in vendor_quotes if v.category == "media" and v.available], key=lambda v: v.cost_usd)

    best_within_budget = None
    cheapest_overall = None

    for venue in venues:
        for food in foods:
            for media in medias:
                total = venue.cost_usd + food.cost_usd + media.cost_usd
                combo = (venue, food, media, total)
                if cheapest_overall is None or total < cheapest_overall[3]:
                    cheapest_overall = combo
                if total <= request.budget_usd:
                    if best_within_budget is None or total < best_within_budget[3]:
                        best_within_budget = combo

    chosen = best_within_budget or cheapest_overall
    if not chosen:
        return PlannerOutput(items=[], total_proposed_cost=0.0, notes="Fallback planner: no vendors available.")

    venue, food, media, total = chosen
    items = [
        ItineraryItem(vendor_id=venue.vendor_id, category=venue.category, name=venue.name, cost_usd=venue.cost_usd),
        ItineraryItem(vendor_id=food.vendor_id, category=food.category, name=food.name, cost_usd=food.cost_usd),
        ItineraryItem(vendor_id=media.vendor_id, category=media.category, name=media.name, cost_usd=media.cost_usd),
    ]
    note = "within budget" if best_within_budget else "cheapest valid (over budget)"
    return PlannerOutput(
        items=items,
        total_proposed_cost=total,
        notes=f"Fallback planner: {note} combination selected.",
    )


def run_planner(
    request: PlanRequest,
    vendor_quotes: list[VendorQuote],
    previous_rejection_reason: str | None = None,
) -> PlannerOutput:
    if os.getenv("MOCK_LLM", "false").lower() == "true":
        logger.info("Using mock planner fallback (MOCK_LLM is enabled).")
        return _mock_planner_output(request, vendor_quotes)

    try:
        client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        user_content = {
            "constraints": request.model_dump(),
            "vendor_quotes": [v.model_dump() for v in vendor_quotes],
            "previous_rejection_reason": previous_rejection_reason,
        }

        response = client.models.generate_content(
            model="gemini-3.5-flash",
            contents=json.dumps(user_content),
            config=types.GenerateContentConfig(
                system_instruction=PLANNER_SYSTEM_PROMPT,
                response_mime_type="application/json",
                temperature=0.3,
            ),
        )

        response_text = response.text.strip()
        start = response_text.find("{")
        if start != -1:
            response_text = response_text[start:]
        
        data = json.JSONDecoder().raw_decode(response_text)[0]
        return PlannerOutput(**data)
    except Exception as e:
        logger.warning(f"Gemini API call failed in planner: {e}. Falling back to mock planner output.")
        return _mock_planner_output(request, vendor_quotes)
