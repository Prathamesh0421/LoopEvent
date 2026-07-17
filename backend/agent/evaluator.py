import json
import os

from google import genai
from google.genai import types

from agent.prompts import EVALUATOR_SYSTEM_PROMPT
from models.schemas import EvaluatorOutput, PlanRequest, PlannerOutput, VendorQuote


def run_evaluator(
    request: PlanRequest,
    plan: PlannerOutput,
    vendor_quotes: list[VendorQuote],
) -> EvaluatorOutput:
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents=json.dumps(
            {
                "constraints": request.model_dump(),
                "proposed_itinerary": plan.model_dump(),
                "vendor_quotes": [quote.model_dump() for quote in vendor_quotes],
            }
        ),
        config=types.GenerateContentConfig(
            system_instruction=EVALUATOR_SYSTEM_PROMPT,
            response_mime_type="application/json",
            temperature=0.0,
        ),
    )
    llm_result = EvaluatorOutput(**json.loads(response.text))

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
        hard_total <= request.budget_usd
        and hard_capacity_ok
        and hard_vendors_valid
    )

    if llm_result.passed != hard_passed:
        return EvaluatorOutput(
            passed=hard_passed,
            total_cost=hard_total,
            budget_diff=request.budget_usd - hard_total,
            capacity_ok=hard_capacity_ok,
            reason=(
                f"[safety-net override] LLM said passed={llm_result.passed}, "
                f"but arithmetic check says passed={hard_passed}. "
                f"Original LLM reason: {llm_result.reason}"
            ),
        )
    return llm_result
