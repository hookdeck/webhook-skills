"""Tests for the Onfleet webhook handler.

Signatures are generated exactly the way Onfleet does: HMAC-SHA512 over the
raw body, keyed with the HEX-DECODED secret, lowercase hex digest.
"""

import hashlib
import hmac
import json
import logging
import os

import pytest
from fastapi.testclient import TestClient

# Onfleet webhook secrets are hex strings. This is hex("onfleet-test-secret-key").
# Set it BEFORE importing the app.
SECRET_HEX = "6f6e666c6565742d746573742d7365637265742d6b6579"
os.environ["ONFLEET_WEBHOOK_SECRET"] = SECRET_HEX

from main import app, handle_onfleet_event, verify_onfleet_signature  # noqa: E402

client = TestClient(app)


def sign_onfleet(body: bytes, secret_hex: str = SECRET_HEX) -> str:
    return hmac.new(bytes.fromhex(secret_hex), body, hashlib.sha512).hexdigest()


def post_signed(body: bytes, signature: str = None):
    if signature is None:
        signature = sign_onfleet(body)
    return client.post(
        "/webhooks/onfleet",
        content=body,
        headers={"Content-Type": "application/json", "X-Onfleet-Signature": signature},
    )


# Every trigger name from the Onfleet trigger table (ids 0-30; 11 and 21 are
# not documented), plus `taskPredictedDelay`, the name the published sample
# payload for trigger 30 carries.
TRIGGERS = [
    (0, "taskStarted"),
    (1, "taskEta"),
    (2, "taskArrival"),
    (3, "taskCompleted"),
    (4, "taskFailed"),
    (5, "workerDuty"),
    (6, "taskCreated"),
    (7, "taskUpdated"),
    (8, "taskDeleted"),
    (9, "taskAssigned"),
    (10, "taskUnassigned"),
    (12, "taskDelayed"),
    (13, "taskCloned"),
    (14, "smsRecipientResponseMissed"),
    (15, "workerCreated"),
    (16, "workerDeleted"),
    (17, "SMSRecipientOptOut"),
    (18, "autoDispatchJobCompleted"),
    (19, "taskBatchCreateJobCompleted"),
    (20, "routeOptimizationJobCompleted"),
    (22, "routePlanCreated"),
    (23, "routePlanStarted"),
    (24, "routePlanCompleted"),
    (25, "workerUpdated"),
    (26, "routePlanUpdated"),
    (27, "routePlanUnassigned"),
    (28, "routePlanAssigned"),
    (29, "routePlanDelayed"),
    (30, "predictedTaskDelay"),
    (30, "taskPredictedDelay"),
]

# Shape of the documented taskCreated sample, trimmed. Note the null fields,
# the `[]` metadata placeholder, ids containing ~ and *, and [lon, lat].
TASK_CREATED_PAYLOAD = json.dumps(
    {
        "actionContext": {"id": "vjw*RDMKDljKVDve1Vtcplgu", "type": "ADMIN"},
        "adminId": "vjw*RDMKDljKVDve1Vtcplgu",
        "data": {
            "task": {
                "id": "txiK2xHBIaUwAKB~BJrjscKu",
                "shortId": "fab829cf",
                "state": 1,
                "container": {"type": "WORKER", "worker": "COwfwH~Zogm1LXIZYbPlLAyw"},
                "destination": {"location": [-117.8764687, 33.8078476]},
                "metadata": [],
            }
        },
        "taskId": "txiK2xHBIaUwAKB~BJrjscKu",
        "time": 1613002584051,
        "triggerId": 6,
        "triggerName": "taskCreated",
        "workerId": None,
    }
).encode()


@pytest.fixture(autouse=True)
def restore_secret():
    yield
    os.environ["ONFLEET_WEBHOOK_SECRET"] = SECRET_HEX


class TestValidationHandshake:
    def test_echoes_check_as_text_plain_with_200(self):
        res = client.get("/webhooks/onfleet?check=example")
        assert res.status_code == 200
        assert res.text == "example"
        assert res.headers["content-type"].startswith("text/plain")

    def test_echoes_value_verbatim_unsigned(self):
        token = "a1B2~c3*D4-e5_f6"
        res = client.get("/webhooks/onfleet", params={"check": token})
        assert res.status_code == 200
        assert res.text == token

    def test_returns_400_when_check_missing(self):
        res = client.get("/webhooks/onfleet")
        assert res.status_code == 400


class TestWebhookPost:
    def test_valid_signature(self):
        res = post_signed(TASK_CREATED_PAYLOAD)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex_signature(self):
        res = post_signed(TASK_CREATED_PAYLOAD, sign_onfleet(TASK_CREATED_PAYLOAD).upper())
        assert res.status_code == 200

    def test_missing_signature_header(self):
        res = client.post(
            "/webhooks/onfleet",
            content=TASK_CREATED_PAYLOAD,
            headers={"Content-Type": "application/json"},
        )
        assert res.status_code == 400
        assert "Missing X-Onfleet-Signature header" in res.text

    def test_invalid_signature(self):
        res = post_signed(TASK_CREATED_PAYLOAD, "deadbeef")
        assert res.status_code == 400
        assert "Invalid signature" in res.text

    def test_tampered_body(self):
        signature = sign_onfleet(TASK_CREATED_PAYLOAD)
        tampered = TASK_CREATED_PAYLOAD.replace(b"taskCreated", b"taskDeleted")
        res = post_signed(tampered, signature)
        assert res.status_code == 400

    def test_rejects_secret_used_as_utf8_string(self):
        # Regression: the key must be hex-decoded, not the raw secret string.
        wrong_key = hmac.new(SECRET_HEX.encode(), TASK_CREATED_PAYLOAD, hashlib.sha512).hexdigest()
        res = post_signed(TASK_CREATED_PAYLOAD, wrong_key)
        assert res.status_code == 400

    def test_rejects_hmac_sha256(self):
        sha256 = hmac.new(bytes.fromhex(SECRET_HEX), TASK_CREATED_PAYLOAD, hashlib.sha256).hexdigest()
        res = post_signed(TASK_CREATED_PAYLOAD, sha256)
        assert res.status_code == 400

    def test_invalid_json_with_valid_signature(self):
        res = post_signed(b"not json")
        assert res.status_code == 400
        assert "Invalid JSON" in res.text

    def test_fails_closed_when_secret_unset(self):
        del os.environ["ONFLEET_WEBHOOK_SECRET"]
        res = post_signed(TASK_CREATED_PAYLOAD)
        assert res.status_code == 500

    def test_fails_closed_when_secret_not_hex(self):
        os.environ["ONFLEET_WEBHOOK_SECRET"] = "not-a-hex-secret"
        res = post_signed(TASK_CREATED_PAYLOAD)
        assert res.status_code == 500

    @pytest.mark.parametrize("trigger_id,trigger_name", TRIGGERS)
    def test_acknowledges_every_trigger_with_null_fields(self, trigger_id, trigger_name):
        body = json.dumps(
            {
                "triggerId": trigger_id,
                "triggerName": trigger_name,
                "taskId": None,
                "workerId": None,
                "adminId": None,
                "actionContext": None,
                "data": {},
                "time": 1613002584051,
            }
        ).encode()
        res = post_signed(body)
        assert res.status_code == 200

    def test_acknowledges_unknown_trigger(self):
        body = json.dumps({"triggerId": 99, "triggerName": "somethingNew", "data": None, "time": 1}).encode()
        res = post_signed(body)
        assert res.status_code == 200


class TestVerifyOnfleetSignature:
    def test_matches_onfleet_docs_python_sample(self):
        # hmac.new(binascii.a2b_hex(secret), body.encode('utf-8'), 'sha512').hexdigest()
        body = b'{"triggerId":6,"triggerName":"taskCreated","taskId":"txiK2xHBIaUwAKB~BJrjscKu","time":1613002584051}'
        expected = (
            "d7b1dead2bca4ecb74d35eba8541ec308d372367c9068bb207467cd35f230572"
            "875a05e2b159373f2d9d8ca1ebf812522c861758b288d4ce041d827ab47c4f69"
        )
        assert sign_onfleet(body) == expected
        assert verify_onfleet_signature(body, expected, SECRET_HEX) == {"valid": True}

    def test_non_ascii_header_does_not_raise(self):
        result = verify_onfleet_signature(TASK_CREATED_PAYLOAD, "é" * 128, SECRET_HEX)
        assert result == {"valid": False, "error": "Invalid signature"}


class TestHandleOnfleetEvent:
    def test_handles_every_trigger_with_null_or_empty_fields(self):
        for trigger_id, trigger_name in TRIGGERS:
            handle_onfleet_event(
                {"triggerId": trigger_id, "triggerName": trigger_name, "taskId": None, "workerId": None, "data": {}}
            )
            handle_onfleet_event({"triggerId": trigger_id, "triggerName": trigger_name, "data": None})

    def test_sms_recipient_opt_out_shape(self, caplog):
        with caplog.at_level(logging.INFO):
            handle_onfleet_event(
                {
                    "recipient": {"id": "7LecFRKJw7ExfyhBsi9h0NXW", "name": "Joe Smith"},
                    "timestamp": 1632432776621,
                    "SMS": "STOP",
                    "triggerId": 17,
                    "triggerName": "SMSRecipientOptOut",
                    "data": {},
                    "time": 1632432776640,
                }
            )
        assert "Recipient opted out of SMS: 7LecFRKJw7ExfyhBsi9h0NXW" in caplog.text


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
