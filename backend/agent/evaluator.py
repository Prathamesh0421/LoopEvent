import json
import os

from google import genai
from google.genai import types

from agent.prompts import EVALUATOR_SYSTEM_PROMPT
from models.schemas import EvaluatorOutput, PlanRequest, PlannerOutput, VendorQuote

_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


def _deterministic_result(
    request: PlanRequest,
    plan: PlannerOutput,
    vendor_quotes: list[VendorQuote],
) -> EvaluatorOutput:
    """Return the non-negotiable arithmetic and availability assessment."""
    vendor_map = {vendor.vendor_id: vendor for vendor in vendor_quotes}
    hard_total = sum(item.cost_usd for item in plan.items)
    venue_items = [item for item in plan.items if item.category == "venue"]
    hard_capacity_ok = bool(venue_items) and any(
        vendor_map.get(item.vendor_id)
        and vendor_map[item.vendor_id].capacity >= request.attendees
        for item in venue_items
    )
    hard_vendors_valid = all(
        item.vendor_id in vendor_map and vendor_map[item.vendor_id].available
        for item in plan.items
    )
    hard_passed = (
        hard_total <= request.budget_usd and hard_capacity_ok and hard_vendors_valid
    )

    if hard_passed:
        reason = (
            "All selected vendors are available, the venue has capacity, and the "
            "plan is within budget."
        )
    elif hard_total > request.budget_usd:
        reason = "The proposed itinerary exceeds the event budget."
    elif not hard_capacity_ok:
        reason = "The selected venue cannot accommodate the requested guest count."
    else:
        reason = "The itinerary contains an invalid or unavailable vendor."

    return EvaluatorOutput(
        passed=hard_passed,
        total_cost=hard_total,
        budget_diff=request.budget_usd - hard_total,
        capacity_ok=hard_capacity_ok,
        reason=reason,
    )


def run_evaluator(
    request: PlanRequest,
    plan: PlannerOutput,
    vendor_quotes: list[VendorQuote],
) -> EvaluatorOutput:
    """Evaluate a plan, failing closed if the LLM response cannot be parsed."""
    hard_result = _deterministic_result(request, plan, vendor_quotes)
    user_content = {
        "constraints": request.model_dump(),
        "proposed_itinerary": plan.model_dump(),
        "vendor_quotes": [vendor.model_dump() for vendor in vendor_quotes],
    }

    try:
        response = _client.models.generate_content(
            model="gemini-3.5-flash",
            contents=json.dumps(user_content),
            config=types.GenerateContentConfig(
                system_instruction=EVALUATOR_SYSTEM_PROMPT,
                response_mime_type="application/json",
                temperature=0.0,
            ),
        )
        response_text = response.text.strip()
        start = response_text.find("{")
        if start == -1:
            raise ValueError("Evaluator response did not contain a JSON object")
        llm_result = EvaluatorOutput(**json.loads(response_text[start:]))
    except Exception:
        return hard_result.model_copy(
            update={"reason": (
                "[safety-net fallback] The evaluator response was unavailable or malformed; "
                f"deterministic validation applied. {hard_result.reason}"
            )}
        )

    if llm_result.passed != hard_result.passed:
        return hard_result.model_copy(
            update={"reason": (
                f"[safety-net override] LLM said passed={llm_result.passed}, "
                f"but deterministic validation says passed={hard_result.passed}. "
                f"Original LLM reason: {llm_result.reason}"
            )}
        )

    return hard_result.model_copy(update={"reason": llm_result.reason})
