import os

import requests
from twilio.rest import Client

from models.schemas import PlannerOutput


def send_sms(message: str) -> None:
    client = Client(
        os.environ["TWILIO_ACCOUNT_SID"], os.environ["TWILIO_AUTH_TOKEN"]
    )
    client.messages.create(
        body=message,
        from_=os.environ["TWILIO_FROM_NUMBER"],
        to=os.environ["TWILIO_TO_NUMBER"],
    )


def mock_payment_webhook(itinerary: PlannerOutput) -> None:
    url = os.environ["MOCK_PAYMENT_WEBHOOK_URL"]
    for item in itinerary.items:
        response = requests.post(
            url,
            json={
                "vendor_id": item.vendor_id,
                "name": item.name,
                "amount_usd": item.cost_usd,
                "action": "charge",
            },
            timeout=10,
        )
        response.raise_for_status()

