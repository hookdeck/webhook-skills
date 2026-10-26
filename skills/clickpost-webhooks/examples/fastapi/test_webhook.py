import json
import os

os.environ["CLICKPOST_WEBHOOK_SECRET"] = "cp_test_simple_token_123"

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_clickpost_request  # noqa: E402

SECRET = os.environ["CLICKPOST_WEBHOOK_SECRET"]
client = TestClient(app)


def scan(code, description, status, **overrides):
    """Shape follows ClickPost's documented sample payloads."""
    body = {
        "waybill": "TEST-AWB-HLD-123",
        "cp_id": 10001,
        "status": status,
        "remark": status,
        "location": "Pushpak_Nagar",
        "timestamp": "2024-11-19T10:04:20Z",
        "clickpost_status_code": code,
        "clickpost_status_description": description,
        "additional": {
            "notification_event_id": 92,
            "latest_status": {"clickpost_status_code": code, "clickpost_status_description": description},
            "is_rvp": False,
            "order_id": "TESTORDERHLD123",
        },
    }
    body.update(overrides)
    return body


def post(body, auth=f"Token {SECRET}", content_type="application/json"):
    headers = {"content-type": content_type}
    if auth is not None:
        headers["authorization"] = auth
    data = body if isinstance(body, str) else json.dumps(body)
    return client.post("/webhooks/clickpost", content=data, headers=headers)


def test_accepts_token_scheme():
    res = post(scan(8, "Delivered", "Delivered", waybill="W-OK-1"))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_scheme_is_case_insensitive():
    assert post(scan(6, "OutForDelivery", "Out for Delivery", waybill="W-CASE"), f"tOkEn {SECRET}").status_code == 200


def test_accepts_any_content_type():
    assert post(scan(4, "PickedUp", "Picked Up", waybill="W-CT"), content_type="text/plain").status_code == 200


def test_rejects_missing_header():
    assert post(scan(8, "Delivered", "Delivered"), None).status_code == 401


def test_rejects_bearer_scheme():
    assert post(scan(8, "Delivered", "Delivered"), f"Bearer {SECRET}").status_code == 401


def test_rejects_bare_secret():
    assert post(scan(8, "Delivered", "Delivered"), SECRET).status_code == 401


def test_rejects_wrong_token_and_different_length():
    assert post(scan(8, "Delivered", "Delivered"), "Token wrong").status_code == 401
    assert post(scan(8, "Delivered", "Delivered"), f"Token {SECRET}x").status_code == 401


def test_does_not_trim_secret():
    assert post(scan(8, "Delivered", "Delivered"), f"Token  {SECRET}").status_code == 401


def test_invalid_json_is_400_after_auth():
    assert post("not json").status_code == 400


def test_missing_status_code_is_400():
    assert post({"waybill": "x"}).status_code == 400


def test_unknown_status_code_is_200():
    assert post(scan(99, "Mystery", "Mystery", waybill="W-UNK")).status_code == 200


def test_dedupes_on_waybill_and_scan():
    body = scan(5, "InTransit", "In Transit", waybill="W-DUP")
    assert post(body).json() == {"received": True}
    assert post(body).json() == {"received": True, "duplicate": True}


def test_rider_allocation_scan():
    assert post(scan(41, "RiderAllocationFailed", "ALLOCATION FAILED", waybill="W-41")).status_code == 200


def test_configured_secret_with_token_prefix_is_stripped():
    assert verify_clickpost_request({"authorization": "Token abc"}, "token abc") is True
    assert verify_clickpost_request({"authorization": "Token abc"}, "abc") is True


def test_fails_closed_when_unconfigured():
    assert verify_clickpost_request({"authorization": "Token "}, "") is False


def test_non_ascii_secret_does_not_raise():
    assert verify_clickpost_request({"authorization": "Token pässword"}, "pässword") is True
    assert verify_clickpost_request({"authorization": "Token pässword"}, "password") is False
