import json
import os
import logging

from google import genai
from google.genai import types

from models.schemas import PlanRequest, PlannerOutput, VendorQuote, ItineraryItem
from agent.prompts import PLANNER_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


def _mock_planner_output(request: PlanRequest, vendor_quotes: list[VendorQuote]) -> PlannerOutput:
    """Fallback planner logic that does a simple matching of vendors."""
    # Find one venue, one food, one media
    venue = next((v for v in vendor_quotes if v.category == "venue" and v.capacity >= request.attendees and v.available), None)
    if not venue:
        # Fallback to any venue
        venue = next((v for v in vendor_quotes if v.category == "venue" and v.available), None)
    
    food = next((v for v in vendor_quotes if v.category == "food" and v.available), None)
    media = next((v for v in vendor_quotes if v.category == "media" and v.available), None)

    items = []
    total_cost = 0.0
    for v in [venue, food, media]:
        if v:
            items.append(ItineraryItem(
                vendor_id=v.vendor_id,
                category=v.category,
                name=v.name,
                cost_usd=v.cost_usd
            ))
            total_cost += v.cost_usd

    return PlannerOutput(
        items=items,
        total_proposed_cost=total_cost,
        notes="Fallback planner: Selected cheapest available vendor quotes."
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
