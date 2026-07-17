import os

from integrations import twilio_direct
from models.schemas import PlannerOutput


def send_approval_sms(message: str) -> None:
    if os.getenv("USE_ZERO_LIVE", "false").lower() == "true":
        _send_sms_via_zero(message)
    else:
        twilio_direct.send_sms(message)


def send_confirmation_sms(message: str) -> None:
    if os.getenv("USE_ZERO_LIVE", "false").lower() == "true":
        _send_sms_via_zero(message)
    else:
        twilio_direct.send_sms(message)


def execute_payments(itinerary: PlannerOutput) -> None:
    if os.getenv("USE_ZERO_LIVE", "false").lower() == "true":
        _trigger_payments_via_zero(itinerary)
    else:
        twilio_direct.mock_payment_webhook(itinerary)


def _send_sms_via_zero(message: str) -> None:
    raise NotImplementedError(
        "Wire this to Zero.xyz's Twilio connector, then set USE_ZERO_LIVE=true"
    )


def _trigger_payments_via_zero(itinerary: PlannerOutput) -> None:
    raise NotImplementedError(
        "Wire this to Zero.xyz's webhook connector, then set USE_ZERO_LIVE=true"
    )

