import json
import os
from pathlib import Path

import requests

from models.schemas import VendorQuote

_MOCK_PATH = Path(__file__).parent.parent / "data" / "mock_vendor_data.json"


def get_vendor_quotes() -> list[VendorQuote]:
    if os.getenv("USE_NEXLA_LIVE", "false").lower() == "true":
        return _get_from_nexla()
    return _get_from_local_mock()


def _get_from_local_mock() -> list[VendorQuote]:
    with _MOCK_PATH.open(encoding="utf-8") as mock_file:
        return [VendorQuote(**vendor) for vendor in json.load(mock_file)]


def _get_from_nexla() -> list[VendorQuote]:
    response = requests.get(
        os.environ["NEXLA_API_URL"],
        headers={"Authorization": f"Bearer {os.environ['NEXLA_ACCESS_TOKEN']}"},
        timeout=10,
    )
    response.raise_for_status()
    return [VendorQuote(**vendor) for vendor in response.json()]

