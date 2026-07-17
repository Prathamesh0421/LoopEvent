import json
import os

from google import genai
from google.genai import types

from agent.prompts import PLANNER_SYSTEM_PROMPT
from models.schemas import PlanRequest, PlannerOutput, VendorQuote


def run_planner(
    request: PlanRequest,
    vendor_quotes: list[VendorQuote],
    previous_rejection_reason: str | None = None,
) -> PlannerOutput:
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    user_content = {
        "constraints": request.model_dump(),
        "vendor_quotes": [quote.model_dump() for quote in vendor_quotes],
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
    return PlannerOutput(**json.loads(response.text))

