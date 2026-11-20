# Generated with: roblox-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time

import pytest

# Synthetic secret: Roblox secrets are whatever you type into the Creator Dashboard.
SECRET = "roblox_synthetic_webhook_secret_7c41"
os.environ["ROBLOX_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402
from main import (  # noqa: E402
    app,
    parse_event_time,
    parse_roblox_signature_header,
    verify_roblox_signature,
)

client = TestClient(app)

# Compact JSON, as Roblox sends it. IDs above 2^31 are normal for Roblox.
ERASURE = '{"NotificationId":"5f0c2b1e-8d3a-4b6f-9e21-0a7c4d9e1001","EventType":"RightToErasureRequest","EventTime":"2026-11-20T16:24:24.2118874Z","EventPayload":{"UserId":3141592653,"GameIds":[4483381587,920587237]}}'
SAMPLE = '{"NotificationId":"5f0c2b1e-8d3a-4b6f-9e21-0a7c4d9e1002","EventType":"SampleNotification","EventTime":"2026-11-20T16:25:00.1000000Z","EventPayload":{"UserId":1}}'
ALERT = '{"NotificationId":"5f0c2b1e-8d3a-4b6f-9e21-0a7c4d9e1003","EventType":"AnalyticsAlert","EventTime":"2026-11-20T16:26:10.8590762Z","EventPayload":{"TargetType":"Universe","TargetId":"1234567890","AlertMessage":"{\\"summary\\":\\"Client crash rate alert fired\\",\\"metric\\":\\"ClientCrashRate\\"}"}}'
# Not a real Roblox EventType: stands in for the triggers whose wire names aren't published.
UNKNOWN = '{"NotificationId":"5f0c2b1e-8d3a-4b6f-9e21-0a7c4d9e1004","EventType":"PlaceholderUndocumentedEvent","EventTime":"2026-11-20T16:27:00.0000000Z","EventPayload":{"Example":true}}'


def now_seconds():
    return int(time.time())


def sign(body, t=None, key=SECRET):
    t = now_seconds() if t is None else t
    digest = hmac.new(key.encode("utf-8"), f"{t}.{body}".encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def header(body, t=None, key=SECRET):
    t = now_seconds() if t is None else t
    return f"t={t},v1={sign(body, t, key)}"


def post(body, signature_header=None):
    headers = {"Content-Type": "application/json"}
    if signature_header is not None:
        headers["roblox-signature"] = signature_header
    return client.post("/webhooks/roblox", content=body.encode("utf-8"), headers=headers)


@pytest.fixture(autouse=True)
def reset(monkeypatch):
    monkeypatch.setenv("ROBLOX_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("ROBLOX_WEBHOOK_TOLERANCE_SECONDS", raising=False)
    main.seen_notification_ids.clear()
    calls = []
    monkeypatch.setattr(main, "process_erasure", lambda *args: calls.append(args))
    yield calls


class TestVerifyRobloxSignature:
    def test_accepts_base64_hmac_of_timestamp_dot_body(self):
        t = now_seconds()
        assert verify_roblox_signature(ERASURE, header(ERASURE, t), SECRET) == {"valid": True, "timestamp": t}

    def test_fixed_test_vector(self):
        body = '{"NotificationId":"test","EventType":"SampleNotification","EventTime":"2023-12-30T16:24:24.2118874Z","EventPayload":{"UserId":1}}'
        result = verify_roblox_signature(
            body,
            "t=1700000000,v1=9gGo8glBNiM69Kw9sLT69cG12dTQovB+C6KacIvo1i4=",
            "roblox_test_secret",
            now=1700000000,
        )
        assert result["valid"] is True

    def test_rejects_hex_digest(self):
        t = now_seconds()
        hex_sig = hmac.new(SECRET.encode(), f"{t}.{ERASURE}".encode(), hashlib.sha256).hexdigest()
        assert verify_roblox_signature(ERASURE, f"t={t},v1={hex_sig}", SECRET)["reason"] == "signature_mismatch"

    def test_rejects_body_first_base_string(self):
        t = now_seconds()
        wrong = base64.b64encode(hmac.new(SECRET.encode(), f"{ERASURE}.{t}".encode(), hashlib.sha256).digest()).decode()
        assert verify_roblox_signature(ERASURE, f"t={t},v1={wrong}", SECRET)["valid"] is False

    def test_rejects_header_without_v1(self):
        assert verify_roblox_signature(ERASURE, f"t={now_seconds()}", SECRET)["reason"] == "missing_v1"

    def test_rejects_without_secret(self):
        assert verify_roblox_signature(ERASURE, header(ERASURE), "")["reason"] == "secret_not_configured"

    def test_non_ascii_signature_does_not_raise(self):
        assert verify_roblox_signature(ERASURE, f"t={now_seconds()},v1=é", SECRET)["valid"] is False

    def test_compact_json_round_trips(self):
        # Roblox's sample signs JSON.stringify(req.body). For compact JSON that's
        # byte-identical to the raw body.
        assert json.dumps(json.loads(ERASURE), separators=(",", ":")) == ERASURE


class TestParsing:
    def test_header_members_in_any_order_keep_padding(self):
        assert parse_roblox_signature_header("v1=abc+/==, t=1700000000, x=ignored") == {
            "timestamp": "1700000000",
            "signatures": ["abc+/=="],
        }

    def test_event_time_with_seven_fractional_digits(self):
        parsed = parse_event_time("2023-12-30T16:24:24.2118874Z")
        assert parsed.isoformat() == "2023-12-30T16:24:24.211887+00:00"

    def test_event_time_garbage(self):
        assert parse_event_time("not a date") is None


class TestWebhookEndpoint:
    def test_right_to_erasure_is_queued(self, reset):
        res = post(ERASURE, header(ERASURE))
        assert res.status_code == 200
        assert res.json() == {
            "received": True,
            "notificationId": "5f0c2b1e-8d3a-4b6f-9e21-0a7c4d9e1001",
            "eventType": "RightToErasureRequest",
            "action": "erasure_queued",
        }
        assert reset == [("5f0c2b1e-8d3a-4b6f-9e21-0a7c4d9e1001", 3141592653, [4483381587, 920587237])]

    def test_sample_notification(self, reset):
        res = post(SAMPLE, header(SAMPLE))
        assert res.status_code == 200
        assert res.json()["action"] == "sample_received"
        assert reset == []

    def test_analytics_alert(self, caplog):
        caplog.set_level("INFO")
        res = post(ALERT, header(ALERT))
        assert res.status_code == 200
        assert res.json()["action"] == "alert_received"
        assert "Client crash rate alert fired" in caplog.text

    def test_unknown_event_type_returns_2xx(self):
        res = post(UNKNOWN, header(UNKNOWN))
        assert res.status_code == 200
        assert res.json()["action"] == "unhandled"

    def test_header_members_in_different_order(self):
        t = now_seconds()
        assert post(SAMPLE, f"v1={sign(SAMPLE, t)},t={t}").status_code == 200

    def test_duplicate_notification_id(self, reset):
        first = post(ERASURE, header(ERASURE))
        second = post(ERASURE, header(ERASURE))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json()["duplicate"] is True
        assert len(reset) == 1

    def test_missing_header(self):
        res = post(ERASURE)
        assert res.status_code == 401
        assert res.json()["detail"]["reason"] == "missing_header"

    def test_header_without_v1(self, reset):
        res = post(ERASURE, f"t={now_seconds()}")
        assert res.status_code == 401
        assert res.json()["detail"]["reason"] == "missing_v1"
        assert reset == []

    def test_wrong_secret(self):
        assert post(ERASURE, header(ERASURE, key="some_other_secret")).status_code == 401

    def test_tampered_body(self):
        tampered = ERASURE.replace("3141592653", "3141592654")
        assert post(tampered, header(ERASURE)).status_code == 401

    def test_reserialised_body(self):
        pretty = json.dumps(json.loads(ERASURE), indent=2)
        assert post(pretty, header(ERASURE)).status_code == 401

    def test_expired_timestamp(self):
        res = post(ERASURE, header(ERASURE, now_seconds() - 330))
        assert res.status_code == 401
        assert res.json()["detail"]["reason"] == "timestamp_outside_tolerance"

    def test_future_timestamp(self):
        assert post(ERASURE, header(ERASURE, now_seconds() + 330)).status_code == 401

    def test_timestamp_inside_window(self):
        assert post(ERASURE, header(ERASURE, now_seconds() - 270)).status_code == 200

    def test_tolerance_override(self, monkeypatch):
        monkeypatch.setenv("ROBLOX_WEBHOOK_TOLERANCE_SECONDS", "600")
        assert post(ERASURE, header(ERASURE, now_seconds() - 500)).status_code == 200

    def test_millisecond_timestamp_rejected(self):
        t = int(time.time() * 1000)
        assert post(ERASURE, header(ERASURE, t)).status_code == 401

    def test_signed_body_that_is_not_json(self):
        assert post("not json", header("not json")).status_code == 400

    def test_secret_unset_fails_closed(self, monkeypatch, reset):
        monkeypatch.delenv("ROBLOX_WEBHOOK_SECRET")
        assert post(ERASURE, header(ERASURE)).status_code == 500
        assert reset == []
