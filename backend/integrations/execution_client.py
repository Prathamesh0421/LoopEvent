import os
import subprocess
import json
import logging
from models.schemas import PlannerOutput
from integrations import twilio_direct

logger = logging.getLogger(__name__)

ZERO_BIN = "/Users/mohit/.zero/runtime/bin/zero"
SMS_ENDPOINT = "https://gateway.spraay.app/api/v1/notify/sms"
SMS_CAPABILITY = "spraay-sms-payment-notification-2b2f41dd"


def _zero_fetch(url: str, payload: dict, capability: str) -> None:
    """Helper to execute zero fetch command in subprocess."""
    cmd = [
        ZERO_BIN, "fetch", url,
        "-X", "POST",
        "-d", json.dumps(payload),
        "--capability", capability,
        "--json"
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        stdout = result.stdout.strip()
        json_start = stdout.find("{")
        if json_start != -1:
            json_str = stdout[json_start:]
            resp_data = json.loads(json_str)
            if not resp_data.get("ok"):
                raise RuntimeError(
                    f"Zero capability call failed: {resp_data.get('status')} - {resp_data.get('body')}"
                )
        else:
            raise RuntimeError(f"Zero CLI did not return JSON: {stdout}")
    except subprocess.CalledProcessError as e:
        logger.error(f"Zero CLI call failed: {e.stderr}")
        raise RuntimeError(f"Zero CLI call failed: {e.stderr}")
    except Exception as e:
        logger.error(f"Error parsing Zero CLI response: {e}")
        raise RuntimeError(f"Error calling Zero CLI: {e}")


def send_approval_sms(message: str) -> None:
    if os.getenv("USE_ZERO_LIVE", "false").lower() == "true":
        _zero_fetch(
            SMS_ENDPOINT,
            {"to": os.environ["TWILIO_TO_NUMBER"], "body": message},
            SMS_CAPABILITY
        )
    elif os.getenv("TWILIO_ACCOUNT_SID") and os.getenv("TWILIO_AUTH_TOKEN"):
        twilio_direct.send_sms(message)
    else:
        logger.warning(f"[Mock SMS] Approval SMS would be sent: {message}")


def send_confirmation_sms(message: str) -> None:
    if os.getenv("USE_ZERO_LIVE", "false").lower() == "true":
        _zero_fetch(
            SMS_ENDPOINT,
            {"to": os.environ["TWILIO_TO_NUMBER"], "body": message},
            SMS_CAPABILITY
        )
    elif os.getenv("TWILIO_ACCOUNT_SID") and os.getenv("TWILIO_AUTH_TOKEN"):
        twilio_direct.send_sms(message)
    else:
        logger.warning(f"[Mock SMS] Confirmation SMS would be sent: {message}")


def execute_payments(itinerary: PlannerOutput) -> None:
    if os.getenv("MOCK_PAYMENT_WEBHOOK_URL"):
        url = os.environ["MOCK_PAYMENT_WEBHOOK_URL"]
        for item in itinerary.items:
            import requests
            try:
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
            except Exception as e:
                logger.warning(f"Mock payment webhook failed: {e}")
    else:
        logger.warning("No MOCK_PAYMENT_WEBHOOK_URL configured, skipping payments.")
