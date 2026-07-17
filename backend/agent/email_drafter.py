"""
email_drafter.py — AI agent that drafts professional booking emails
for selected vendors. Falls back to a high-quality template when Gemini
is rate-limited.
"""
import json
import logging
import os
import textwrap

from google import genai
from google.genai import types

from models.schemas import BookingDraft, PlanRequest, VendorQuote

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = textwrap.dedent("""
    You are a professional event coordinator assistant.
    Given an event brief and a selected vendor, draft a concise, warm, and professional
    booking inquiry email from the event organizer to the vendor.

    Return ONLY valid JSON with these fields:
    {
      "subject": "string — email subject line",
      "body": "string — full email body, including greeting and sign-off"
    }

    Guidelines:
    - Address the vendor by their business name.
    - Mention the event date as TBD (to be confirmed).
    - Include the number of attendees and the event type (hackathon).
    - Keep the body under 200 words — professional but friendly.
    - Sign off as "The LoopEvent Team".
""").strip()


def _fallback_draft(request: PlanRequest, vendor: VendorQuote) -> BookingDraft:
    """High-quality template draft used when Gemini is unavailable."""
    category_label = {
        "venue": "event space booking",
        "food": "catering services",
        "media": "photography & media coverage",
    }.get(vendor.category, "services")

    subject = f"Hackathon Booking Inquiry — {vendor.name} | {request.attendees} Attendees"
    body = f"""Dear {vendor.name} Team,

I hope this message finds you well. My name is Sarah Chen, and I'm reaching out on behalf of LoopEvent to inquire about booking your {category_label} for an upcoming hackathon we are organizing in {request.location}.

Here are the key details:

  • Event type: Hackathon
  • Estimated attendees: {request.attendees:,}
  • Date: TBD (targeting next quarter)
  • Budget allocated for your services: ${request.budget_usd:,.0f} total

We came across your excellent reviews and believe {vendor.name} would be a fantastic fit for our event. Could you please confirm your availability and share any package options or requirements?

We look forward to hearing from you and hope to work together soon.

Warm regards,
The LoopEvent Team
events@loopevent.ai | loopevent.ai"""

    return BookingDraft(
        vendor_id=vendor.vendor_id,
        vendor_name=vendor.name,
        category=vendor.category,
        subject=subject,
        body=body,
    )


def draft_booking_email(request: PlanRequest, vendor: VendorQuote) -> BookingDraft:
    """Draft a booking email using Gemini, with template fallback."""
    if os.getenv("MOCK_LLM", "false").lower() == "true":
        return _fallback_draft(request, vendor)

    try:
        client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
        user_content = {
            "event": request.model_dump(),
            "vendor": {
                "name": vendor.name,
                "category": vendor.category,
                "address": vendor.address,
                "cost_usd": vendor.cost_usd,
            },
        }
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=json.dumps(user_content),
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                response_mime_type="application/json",
                temperature=0.5,
            ),
        )
        text = response.text.strip()
        start = text.find("{")
        if start != -1:
            text = text[start:]
        data = json.JSONDecoder().raw_decode(text)[0]
        return BookingDraft(
            vendor_id=vendor.vendor_id,
            vendor_name=vendor.name,
            category=vendor.category,
            subject=data.get("subject", "Booking Inquiry"),
            body=data.get("body", ""),
        )
    except Exception as e:
        logger.warning(f"Gemini email draft failed for {vendor.vendor_id}: {e}. Using template.")
        return _fallback_draft(request, vendor)
