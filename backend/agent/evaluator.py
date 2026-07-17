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

    response_text = response.text.strip()
    start = response_text.find("{")
    if start != -1:
        response_text = response_text[start:]

    data = json.JSONDecoder().raw_decode(response_text)[0]
    llm_result = EvaluatorOutput(**data)

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
