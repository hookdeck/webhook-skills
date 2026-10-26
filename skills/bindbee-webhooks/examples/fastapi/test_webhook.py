import base64
import hashlib
import hmac
import json
import secrets
import time
import uuid

import pytest
from fastapi.testclient import TestClient

import main
from main import app

# Bindbee's secret has no prefix and is used as raw UTF-8 bytes (not base64-decoded)
TEST_SECRET = "k7Hq2xZp9RvLm4TnB8wYc3Ds5Fg1JeUa"

client = TestClient(app)


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("BINDBEE_WEBHOOK_SECRET", TEST_SECRET)
    monkeypatch.delenv("BINDBEE_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def sign(payload: str, timestamp: str, msg_id: str, key: bytes = TEST_SECRET.encode("utf-8")) -> str:
    """base64(HMAC_SHA256(utf8(secret), f"{id}.{timestamp}.{payload}"))"""
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def new_id() -> str:
    return str(uuid.uuid4())


def signed(payload: str, ts: str = None, msg_id: str = None) -> dict:
    ts = ts or now()
    msg_id = msg_id or new_id()
    return {"webhook-id": msg_id, "webhook-timestamp": ts, "webhook-signature": sign(payload, ts, msg_id)}


def post(payload: str, headers: dict, content_type: str = "application/json"):
    return client.post("/webhooks/bindbee", content=payload, headers={"content-type": content_type, **headers})


CONNECTOR = {
    "id": "01a0a4c6-9807-7c4b-9705-e8359ac15030",
    "integration": {"name": "BambooHR", "slug": "bamboohr"},
    "category": "HRIS",
    "origin_id": "prod_acme-inc_x1y2z3",
    "connector_status": "COMPLETE",
    "name": "Acme Inc",
    "environment": "production",
}
SYNC = {"sync_id": "01a0a9de-bda5-7512-b7a3-4ecb67abc77d", "sync_type": "AUTOMATED", "sync_name": "#18"}


def event(name: str, **extra) -> str:
    return json.dumps({
        "id": new_id(),
        "event": name,
        "version": "2026.10.06",
        "sequence": 11,
        "occurred_at": "2026-09-16T11:00:10.198843+00:00",
        "webhook": {"webhook_id": "01a0a417-ce39-7799-9565-993c95eec951", "url": "https://example.com/webhooks/bindbee", "event": name},
        "connector": CONNECTOR,
        "data": [],
        "sync": SYNC,
        **extra,
    })


def employee_created() -> str:
    return event("hris.employee.created", model="employee",
                 data=["01a0a4fc-a046-76bf-bd66-16218012d4e7", "01a0a9de-e417-79e2-b989-2f2e13f47c31"])


class TestValidEvents:
    def test_hris_employee_created(self):
        p = employee_created()
        r = post(p, signed(p))
        assert r.status_code == 200
        assert r.json()["event"] == "hris.employee.created"

    def test_hris_employee_updated(self):
        p = event("hris.employee.updated", model="employee", data=["01a0a4fc-a046-76bf-bd66-16218012d4e7"])
        r = post(p, signed(p))
        assert r.status_code == 200
        assert r.json()["event"] == "hris.employee.updated"

    @pytest.mark.parametrize("name", [
        "connector.sync.started", "connector.sync.completed", "connector.linked", "connector.relinked",
    ])
    def test_connector_events(self, name):
        p = event(name, data={"id": CONNECTOR["id"], "integration_name": "bamboohr", "category": "HRIS",
                              "display_status": "Syncing", "last_sync_start_time": None})
        r = post(p, signed(p))
        assert r.status_code == 200
        assert r.json()["event"] == name

    @pytest.mark.parametrize("name", ["connector.sync.failed", "connector.relink_needed"])
    def test_error_events(self, name):
        p = event(name, error={"failed_at": "2026-09-16T12:01:41.784841+00:00",
                               "message": "Received error response when validating the connection.", "detail": {}})
        r = post(p, signed(p))
        assert r.status_code == 200
        assert r.json()["event"] == name

    @pytest.mark.parametrize("name", ["ats.application.updated", "lms.enrollment.created"])
    def test_ats_and_lms_events_with_unknown_fields(self, name):
        p = event(name, model=name.split(".")[1], data=["id-1"], brand_new_field={"nested": True})
        assert post(p, signed(p)).status_code == 200

    def test_unhandled_event_is_acknowledged(self):
        p = event("something.else")
        assert post(p, signed(p)).status_code == 200

    def test_raw_bytes_verified_whatever_the_content_type(self):
        p = employee_created()
        assert post(p, signed(p), "text/plain").status_code == 200

    def test_repeated_event_id_is_a_duplicate(self):
        p = employee_created()
        first = post(p, signed(p))
        retry = post(p, signed(p, now(), json.loads(p)["id"]))
        assert "duplicate" not in first.json()
        assert retry.status_code == 200
        assert retry.json()["duplicate"] is True


class TestSecretAndHeaders:
    def test_secret_is_raw_utf8_not_base64_decoded(self):
        p = employee_created()
        ts, mid = now(), new_id()
        wrong_key = base64.b64decode(TEST_SECRET)  # what the standardwebhooks library would use
        h = {"webhook-id": mid, "webhook-timestamp": ts, "webhook-signature": sign(p, ts, mid, wrong_key)}
        assert post(p, h).status_code == 401

    def test_whsec_prefix_is_base64_decoded(self, monkeypatch):
        key = b"another_secret_key_of_32_bytes!!"
        monkeypatch.setenv("BINDBEE_WEBHOOK_SECRET", "whsec_" + base64.b64encode(key).decode())
        p = employee_created()
        ts, mid = now(), new_id()
        h = {"webhook-id": mid, "webhook-timestamp": ts, "webhook-signature": sign(p, ts, mid, key)}
        assert post(p, h).status_code == 200

    def test_svix_headers_are_accepted(self):
        p = employee_created()
        ts, mid = now(), new_id()
        h = {"svix-id": mid, "svix-timestamp": ts, "svix-signature": sign(p, ts, mid)}
        assert post(p, h).status_code == 200

    def test_any_matching_v1_entry_wins_and_other_versions_are_ignored(self):
        p = employee_created()
        ts, mid = now(), new_id()
        good = sign(p, ts, mid)
        h = {"webhook-id": mid, "webhook-timestamp": ts,
             "webhook-signature": f"v1,aW52YWxpZA== v1a,{good[3:]} {good}"}
        assert post(p, h).status_code == 200

    def test_signature_under_another_version_is_rejected(self):
        p = employee_created()
        ts, mid = now(), new_id()
        h = {"webhook-id": mid, "webhook-timestamp": ts, "webhook-signature": f"v1a,{sign(p, ts, mid)[3:]}"}
        assert post(p, h).status_code == 401

    def test_missing_headers(self):
        r = post(employee_created(), {})
        assert r.status_code == 400
        assert "Missing required" in r.json()["detail"]

    def test_partial_headers(self):
        p = employee_created()
        h = signed(p)
        del h["webhook-signature"]
        assert post(p, h).status_code == 400

    def test_invalid_signature(self):
        h = {"webhook-id": new_id(), "webhook-timestamp": now(), "webhook-signature": "v1,aW52YWxpZA=="}
        r = post(employee_created(), h)
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid signature"

    def test_tampered_body(self):
        h = signed(employee_created())
        assert post(employee_created(), h).status_code == 401

    def test_fails_closed_when_secret_unset(self, monkeypatch):
        monkeypatch.delenv("BINDBEE_WEBHOOK_SECRET")
        p = employee_created()
        assert post(p, signed(p)).status_code == 500

    def test_empty_signing_key_is_rejected(self):
        with pytest.raises(main.WebhookVerificationError):
            main.verify_bindbee_signature(b"{}", "id", now(), "v1,AAAA", "whsec_")


class TestTimestamp:
    @pytest.mark.parametrize("ts", ["0", "-5", "1.5", "+5", "012", "1e9", "abc"])
    def test_not_a_plain_positive_integer(self, ts):
        p = employee_created()
        assert post(p, signed(p, ts)).status_code == 401

    def test_old_timestamp_accepted_by_default(self):
        old = str(int(time.time()) - 3600)
        p = employee_created()
        assert post(p, signed(p, old)).status_code == 200

    def test_old_timestamp_rejected_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("BINDBEE_WEBHOOK_TOLERANCE_SECONDS", "300")
        old = str(int(time.time()) - 3600)
        p = employee_created()
        r = post(p, signed(p, old))
        assert r.status_code == 401
        assert r.json()["detail"] == "Timestamp too old"
        fresh = employee_created()
        assert post(fresh, signed(fresh)).status_code == 200

    def test_non_numeric_tolerance_is_treated_as_off(self, monkeypatch):
        monkeypatch.setenv("BINDBEE_WEBHOOK_TOLERANCE_SECONDS", "five minutes")
        old = str(int(time.time()) - 3600)
        p = employee_created()
        assert post(p, signed(p, old)).status_code == 200


class TestBody:
    def test_signed_body_that_is_not_json(self):
        p = "not json"
        r = post(p, signed(p))
        assert r.status_code == 400
        assert r.json()["detail"] == "Invalid JSON"


def test_head_check_returns_200():
    assert client.head("/webhooks/bindbee").status_code == 200


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}
