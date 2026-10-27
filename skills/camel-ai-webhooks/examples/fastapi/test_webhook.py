import base64
import hashlib
import hmac
import json
import time

import pytest
from fastapi.testclient import TestClient

# camelAI secrets are "whsec_" + base64 of the key bytes.
SECRET = "whsec_" + base64.b64encode(b"test_secret_key_for_camel_ai_hooks").decode()

import main  # noqa: E402

client = TestClient(main.app)

EVENT_TYPES = [
    "run.started", "run.completed", "run.failed", "input.requested", "input.resolved",
    "usage.recorded", "voice.session.started", "voice.session.ended", "voice.session.error",
    "voice.utterance", "voice.speech.started", "voice.speech.ended", "billing.balance.low",
    "billing.balance.depleted", "end_user.balance.low", "end_user.credit.exhausted",
    "end_user.credit.granted", "end_user.credit.refunded", "end_user.credit.adjusted",
    "end_user.allowance.low",
]


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("CAMEL_AI_WEBHOOK_SECRET", SECRET)
    main.processed_event_ids.clear()


def sign(msg_id: str, timestamp: str, body: str, secret: str = SECRET) -> str:
    key = base64.b64decode(secret.removeprefix("whsec_"))
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def make_event(event_type: str = "run.completed", event_id: str = "evt_test_123") -> str:
    return json.dumps(
        {"id": event_id, "type": event_type, "created": int(time.time()), "data": {"example": True}}
    )


def signed_headers(body: str, prefix: str = "webhook", event_id: str = "evt_test_123",
                   timestamp: int = None, secret: str = SECRET) -> dict:
    ts = str(int(time.time()) if timestamp is None else timestamp)
    return {
        f"{prefix}-id": event_id,
        f"{prefix}-timestamp": ts,
        f"{prefix}-signature": sign(event_id, ts, body, secret),
    }


def post(body: str, headers: dict, content_type: str = "application/json"):
    return client.post(
        "/webhooks/camel-ai",
        content=body.encode(),
        headers={"content-type": content_type, **headers},
    )


def test_accepts_valid_webhook_headers():
    body = make_event()
    res = post(body, signed_headers(body, event_id="evt_valid_1"))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_svix_prefixed_headers():
    body = make_event("run.started", "evt_svix_1")
    res = post(body, signed_headers(body, prefix="svix", event_id="evt_svix_1"))
    assert res.status_code == 200


@pytest.mark.parametrize("event_type", EVENT_TYPES)
def test_handles_documented_event_types(event_type):
    event_id = f"evt_{event_type}"
    body = make_event(event_type, event_id)
    res = post(body, signed_headers(body, event_id=event_id))
    assert res.status_code == 200


def test_accepts_any_content_type():
    body = make_event("run.failed", "evt_ct_1")
    res = post(body, signed_headers(body, event_id="evt_ct_1"), content_type="text/plain")
    assert res.status_code == 200


def test_accepts_signature_list_with_one_matching_entry():
    body = make_event("usage.recorded", "evt_multi_1")
    headers = signed_headers(body, event_id="evt_multi_1")
    wrong = "v1," + base64.b64encode(b"wrong").decode()
    headers["webhook-signature"] = f"{wrong} {headers['webhook-signature']}"
    assert post(body, headers).status_code == 200


def test_rejects_tampered_body():
    body = make_event()
    headers = signed_headers(body, event_id="evt_tamper_1")
    assert post(body.replace("run.completed", "run.failed"), headers).status_code == 400


def test_rejects_other_endpoints_secret():
    body = make_event()
    other = "whsec_" + base64.b64encode(b"some_other_endpoint_secret").decode()
    res = post(body, signed_headers(body, event_id="evt_other_1", secret=other))
    assert res.status_code == 400


def test_rejects_timestamp_outside_window():
    body = make_event()
    res = post(body, signed_headers(body, event_id="evt_old_1", timestamp=int(time.time()) - 600))
    assert res.status_code == 400


def test_rejects_missing_headers():
    assert post(make_event(), {}).status_code == 400


def test_rejects_signed_empty_body():
    assert post("", signed_headers("", event_id="evt_empty")).status_code == 400


def test_acknowledges_retry_without_reprocessing():
    body = make_event("run.completed", "evt_dup_1")
    headers = signed_headers(body, event_id="evt_dup_1")
    first = post(body, headers)
    second = post(body, headers)
    assert first.status_code == 200
    assert second.json() == {"received": True, "duplicate": True}


def test_fails_closed_without_secret(monkeypatch):
    body = make_event()
    headers = signed_headers(body, event_id="evt_nosecret")
    monkeypatch.delenv("CAMEL_AI_WEBHOOK_SECRET")
    assert post(body, headers).status_code == 500
