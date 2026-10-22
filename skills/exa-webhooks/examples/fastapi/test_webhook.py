import hashlib
import hmac
import os
import time

import pytest
from fastapi.testclient import TestClient

# Exa returns the secret as an opaque string on webhook creation; this one is only for tests
SECRET = "test_exa_webhook_secret_5c1f"
os.environ["EXA_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sig(body: str, timestamp=None, secret=SECRET) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    return hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()


def header(body: str, timestamp=None, secret=SECRET) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    return f"t={ts},v1={sig(body, ts, secret)}"


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["Exa-Signature"] = signature
    return client.post("/webhooks/exa", content=body, headers=headers)


ITEM_CREATED = (
    '{"id":"evt_1","object":"event","type":"webset.item.created",'
    '"data":{"id":"item_1","object":"webset_item"},"createdAt":"2026-01-01T00:00:00Z"}'
)


def test_accepts_valid_signature():
    res = post(ITEM_CREATED, header(ITEM_CREATED))
    assert res.status_code == 200
    assert res.json() == {"received": True}


@pytest.mark.parametrize(
    "event_type",
    ["webset.created", "webset.idle", "webset.search.completed", "webset.item.enriched"],
)
def test_handles_events(event_type):
    body = f'{{"id":"evt_2","type":"{event_type}","data":{{"id":"x"}}}}'
    assert post(body, header(body)).status_code == 200


def test_accepts_unknown_event_types():
    body = '{"id":"evt_3","type":"monitor.run.completed","data":{}}'
    assert post(body, header(body)).status_code == 200


def test_verifies_regardless_of_content_type():
    assert post(ITEM_CREATED, header(ITEM_CREATED), "text/plain").status_code == 200


def test_accepts_when_any_v1_matches():
    ts = int(time.time())
    h = f"t={ts},v1={sig(ITEM_CREATED, ts, 'old_secret')},v1={sig(ITEM_CREATED, ts)}"
    assert post(ITEM_CREATED, h).status_code == 200


def test_rejects_missing_header():
    assert post(ITEM_CREATED).status_code == 400


def test_rejects_tampered_body():
    assert post(ITEM_CREATED.replace("item_1", "item_2"), header(ITEM_CREATED)).status_code == 400


def test_rejects_wrong_secret():
    assert post(ITEM_CREATED, header(ITEM_CREATED, secret="other_secret")).status_code == 400


def test_rejects_signature_of_different_length():
    assert post(ITEM_CREATED, f"t={int(time.time())},v1=abcd").status_code == 400


def test_rejects_header_without_timestamp():
    assert post(ITEM_CREATED, f"v1={sig(ITEM_CREATED, 123)}").status_code == 400


def test_rejects_header_without_v1():
    assert post(ITEM_CREATED, f"t={int(time.time())}").status_code == 400


def test_rejects_tampered_timestamp():
    ts = int(time.time())
    assert post(ITEM_CREATED, f"t={ts + 1},v1={sig(ITEM_CREATED, ts)}").status_code == 400


def test_accepts_old_timestamp_by_default():
    old = int(time.time()) - 3600
    assert post(ITEM_CREATED, header(ITEM_CREATED, old)).status_code == 200


def test_rejects_old_timestamp_when_tolerance_set(monkeypatch):
    monkeypatch.setenv("EXA_TIMESTAMP_TOLERANCE_SECONDS", "300")
    old = int(time.time()) - 3600
    assert post(ITEM_CREATED, header(ITEM_CREATED, old)).status_code == 400
    assert post(ITEM_CREATED, header(ITEM_CREATED)).status_code == 200


def test_rejects_valid_signature_over_invalid_json():
    body = "not json"
    assert post(body, header(body)).status_code == 400
