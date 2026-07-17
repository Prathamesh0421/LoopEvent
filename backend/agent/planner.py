import json
import os
from google import genai
from google.genai import types

from models.schemas import PlanRequest, VendorQuote, PlannerOutput
from agent.prompts import PLANNER_SYSTEM_PROMPT

_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


def run_planner(
    request: PlanRequest,
    vendor_quotes: list[VendorQuote],
    previous_rejection_reason: str | None = None,
) -> PlannerOutput:
    user_content = {
        "constraints": request.model_dump(),
        "vendor_quotes": [v.model_dump() for v in vendor_quotes],
        "previous_rejection_reason": previous_rejection_reason,
    }

    response = _client.models.generate_content(
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
