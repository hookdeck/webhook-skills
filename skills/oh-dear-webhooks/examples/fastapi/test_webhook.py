import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "YoUrSeCreT"  # Oh Dear secrets are used as plain UTF-8 text
os.environ["OH_DEAR_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)

# Based on the monitorAddedNotification example in Oh Dear's docs
MONITOR_ADDED = json.dumps(
    {
        "type": "monitorAddedNotification",
        "date_time": "20191001113659",
        "monitor": {
            "id": 1,
            "url": "https://yoursite.tld",
            "uses_https": True,
            "sort_url": "yoursite.tld",
            "label": "yoursite.tld",
            "team_id": 1,
            "latest_run_date": None,
            "summarized_check_result": "pending",
            "created_at": "2019-10-01 09:36:59",
            "updated_at": "2019-10-01 09:36:59",
            "checks": [
                {"id": 39675, "type": "uptime", "enabled": True, "monitor_id": 1, "latest_run_result": None}
            ],
        },
    },
    indent=2,
)


def uptime_failed(kind: str) -> str:
    return json.dumps(
        {
            "uuid": "860e04a8-2025-4793-a45c-c9ad71710cf2",
            "type": f"{kind}UptimeCheckFailedNotification",
            "date_time": "20180312092737",
            "result_url": "https://ohdear.app/monitors/1/check/uptime/report/2",
        }
    )


def sign(body: str, secret: str = SECRET) -> str:
    # hash_hmac('sha256', $payload, $secret): lowercase hex of the raw body
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


def post(body: str, signature: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["OhDear-Signature"] = signature
    return client.post("/webhooks/oh-dear", content=body.encode(), headers=headers)


def test_accepts_documented_monitor_added():
    res = post(MONITOR_ADDED, sign(MONITOR_ADDED))
    assert res.status_code == 200
    assert res.json() == {"received": True}


@pytest.mark.parametrize("kind", ["http", "tcp", "ping"])
def test_accepts_uptime_failures(kind):
    body = uptime_failed(kind)
    assert post(body, sign(body)).status_code == 200


def test_accepts_uppercase_hex_signature():
    assert post(MONITOR_ADDED, sign(MONITOR_ADDED).upper()).status_code == 200


def test_verifies_raw_bytes_whatever_the_content_type():
    assert post(MONITOR_ADDED, sign(MONITOR_ADDED), "text/plain").status_code == 200


def test_unhandled_event_returns_200():
    body = json.dumps({"uuid": "u", "type": "lighthouseIssuesFixedNotification"})
    assert post(body, sign(body)).status_code == 200


def test_missing_signature_returns_401():
    assert post(MONITOR_ADDED).status_code == 401


def test_empty_signature_returns_401():
    assert post(MONITOR_ADDED, "").status_code == 401


def test_prefixed_signature_returns_401():
    assert post(MONITOR_ADDED, f"sha256={sign(MONITOR_ADDED)}").status_code == 401


@pytest.mark.parametrize("sig", ["abc123", "a" * 66, "z" * 64])
def test_malformed_signature_returns_401(sig):
    assert post(MONITOR_ADDED, sig).status_code == 401


def test_wrong_secret_returns_401():
    assert post(MONITOR_ADDED, sign(MONITOR_ADDED, "other")).status_code == 401


def test_tampered_body_returns_401():
    tampered = MONITOR_ADDED.replace("yoursite.tld", "evil.tld")
    assert post(tampered, sign(MONITOR_ADDED)).status_code == 401


def test_reserialized_body_returns_401():
    compact = json.dumps(json.loads(MONITOR_ADDED))
    assert post(compact, sign(MONITOR_ADDED)).status_code == 401


def test_signed_non_json_returns_400():
    body = "not json"
    assert post(body, sign(body), "text/plain").status_code == 400


def test_missing_secret_returns_500(monkeypatch):
    monkeypatch.delenv("OH_DEAR_WEBHOOK_SECRET")
    assert post(MONITOR_ADDED, sign(MONITOR_ADDED)).status_code == 500
