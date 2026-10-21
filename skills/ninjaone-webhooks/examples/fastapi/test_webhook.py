import json
import os

import pytest
from fastapi.testclient import TestClient

# NinjaOne issues no signing secret and signs nothing. The secret is a random value you
# generate (openssl rand -hex 32) and register as the X-Webhook-Secret header value.
SECRET = "a7c3e9015b2d48f6aa11bb22cc33dd44ee55ff66778899aabbccddeeff001122"
os.environ["NINJAONE_WEBHOOK_SECRET"] = SECRET

from main import app, dedupe_key, processed, verify_ninjaone_secret  # noqa: E402

client = TestClient(app)
HEADERS = {"X-Webhook-Secret": SECRET, "Content-Type": "application/json"}
_counter = 0


def make_activity(**overrides):
    """Activity object with the field names from the NinjaOne API v2 Activity schema."""
    global _counter
    _counter += 1
    activity = {
        "id": 3000 + _counter,
        "activityTime": 1792577730.5,
        "deviceId": 42,
        "severity": "MAJOR",
        "priority": "HIGH",
        "seriesUid": "6bcedd3a-fe26-4bcb-9ce9-d3850e38d42c",
        "activityType": "CONDITION",
        "statusCode": "TRIGGERED",
        "status": "Triggered",
        "subject": "Disk free space low",
        "message": "C: has less than 10% free space",
        "data": {},
    }
    activity.update(overrides)
    return activity


def post(body, headers=HEADERS):
    raw = body if isinstance(body, str) else json.dumps(body)
    return client.post("/webhooks/ninjaone", content=raw, headers=headers)


@pytest.fixture(autouse=True)
def reset_state(monkeypatch):
    processed.clear()
    monkeypatch.setenv("NINJAONE_WEBHOOK_SECRET", SECRET)


class TestVerifyNinjaOneSecret:
    def test_accepts_exact_secret(self):
        assert verify_ninjaone_secret(SECRET, SECRET) is True

    def test_rejects_wrong_secret(self):
        assert verify_ninjaone_secret("nope", SECRET) is False

    def test_rejects_different_length_without_raising(self):
        assert verify_ninjaone_secret(SECRET + "x", SECRET) is False

    def test_rejects_missing_header(self):
        assert verify_ninjaone_secret(None, SECRET) is False

    def test_fails_closed_without_secret(self):
        assert verify_ninjaone_secret("", "") is False
        assert verify_ninjaone_secret("anything", None) is False


class TestDedupeKey:
    def test_combines_id_and_status_code(self):
        assert dedupe_key({"id": 7, "statusCode": "RESET"}) == "7:RESET"

    def test_none_without_id(self):
        assert dedupe_key({"activityType": "CONDITION"}) is None


class TestWebhookEndpoint:
    def test_condition_triggered(self):
        res = post(make_activity())
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_condition_reset(self):
        assert post(make_activity(statusCode="RESET")).status_code == 200

    def test_action_and_actionset(self):
        assert post(make_activity(activityType="ACTION", statusCode="COMPLETED")).status_code == 200
        assert post(make_activity(activityType="ACTIONSET", statusCode="STARTED")).status_code == 200

    def test_unhandled_activity_type(self):
        res = post(make_activity(activityType="SYSTEM", statusCode="NODE_CREATED"))
        assert res.status_code == 200

    def test_missing_secret_header(self):
        assert post(make_activity(), headers={"Content-Type": "application/json"}).status_code == 401

    def test_wrong_secret(self):
        headers = {**HEADERS, "X-Webhook-Secret": "wrong"}
        assert post(make_activity(), headers=headers).status_code == 401

    def test_secret_in_other_header_rejected(self):
        headers = {"Authorization": SECRET, "Content-Type": "application/json"}
        assert post(make_activity(), headers=headers).status_code == 401

    def test_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("NINJAONE_WEBHOOK_SECRET")
        assert post(make_activity()).status_code == 500

    def test_invalid_json(self):
        assert post("{not json").status_code == 400

    def test_missing_activity_type(self):
        assert post({"id": 1, "statusCode": "TRIGGERED"}).status_code == 400

    def test_json_array_rejected(self):
        assert post([make_activity()]).status_code == 400

    def test_redelivery_is_not_processed_twice(self):
        activity = make_activity()
        assert post(activity).json() == {"received": True}
        assert post(activity).json() == {"received": True, "duplicate": True}

    def test_new_status_code_is_a_new_event(self):
        activity = make_activity()
        post(activity)
        assert post({**activity, "statusCode": "RESET"}).json() == {"received": True}
