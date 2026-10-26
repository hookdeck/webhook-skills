# Generated with: sahha-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import logging

import pytest
from fastapi.testclient import TestClient

# Any string from the Sahha Dashboard; it is used as UTF-8 bytes, not decoded.
SECRET = "sahha_test_secret_key_123"

import main  # noqa: E402

client = TestClient(main.app)

EVENTS = {
    "ScoreCreatedIntegrationEvent": {"id": "s1", "externalId": "user_12345", "type": "sleep", "state": "high", "score": 0.85},
    "BiomarkerCreatedIntegrationEvent": {"id": "b1", "externalId": "user_12345", "type": "steps", "value": "8547", "unit": "count"},
    "ArchetypeCreatedIntegrationEvent": {"id": "a1", "externalId": "user_12345", "name": "chronotype", "value": "early_bird"},
    "TagReceivedIntegrationEvent": {"id": "t1", "externalId": "user_12345", "type": "state", "name": "night_shift", "value": None},
    "DataLogReceivedIntegrationEvent": {"logType": "activity", "dataType": "steps", "dataLogs": [{"id": "d1", "value": 1250}]},
}


@pytest.fixture(autouse=True)
def secret(monkeypatch):
    monkeypatch.setenv("SAHHA_WEBHOOK_SECRET", SECRET)


def sign(raw: bytes, key: str = SECRET) -> str:
    """Sign exactly like Sahha: lowercase hex HMAC-SHA256 of the raw body, no prefix."""
    return hmac.new(key.encode("utf-8"), raw, hashlib.sha256).hexdigest()


def post(raw, event_type="ScoreCreatedIntegrationEvent", signature=None, headers=None):
    if isinstance(raw, str):
        raw = raw.encode("utf-8")
    h = {
        "content-type": "application/json",
        "x-external-id": "user_12345",
        "x-signature": sign(raw) if signature is None else signature,
    }
    if event_type is not None:
        h["x-event-type"] = event_type
    if headers:
        h.update(headers)
    h = {k: v for k, v in h.items() if v is not None}
    return client.post("/webhooks/sahha", content=raw, headers=h)


class TestValidSignatures:
    @pytest.mark.parametrize("event_type,payload", list(EVENTS.items()))
    def test_accepts_documented_events(self, event_type, payload):
        res = post(json.dumps(payload), event_type=event_type)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex(self):
        raw = json.dumps(EVENTS["ScoreCreatedIntegrationEvent"]).encode()
        assert post(raw, signature=sign(raw).upper()).status_code == 200

    def test_verifies_exact_bytes(self):
        raw = '{ "type" :  "sleep",\n "note": "café ✓" }'.encode("utf-8")
        assert post(raw).status_code == 200

    def test_accepts_any_content_type(self):
        raw = json.dumps(EVENTS["ScoreCreatedIntegrationEvent"])
        assert post(raw, headers={"content-type": "text/plain"}).status_code == 200

    def test_unknown_event_type_is_logged_and_accepted(self, caplog):
        with caplog.at_level(logging.INFO, logger="sahha_webhooks"):
            res = post("{}", event_type="SomethingNewIntegrationEvent")
        assert res.status_code == 200
        assert "Unhandled Sahha event type: SomethingNewIntegrationEvent" in caplog.text


class TestInvalidSignatures:
    RAW = json.dumps(EVENTS["ScoreCreatedIntegrationEvent"]).encode()

    def test_missing_signature(self):
        res = client.post(
            "/webhooks/sahha",
            content=self.RAW,
            headers={"x-event-type": "ScoreCreatedIntegrationEvent"},
        )
        assert res.status_code == 401

    def test_empty_signature(self):
        assert post(self.RAW, signature="").status_code == 401

    def test_wrong_secret(self):
        assert post(self.RAW, signature=sign(self.RAW, "wrong_secret")).status_code == 401

    def test_tampered_body(self):
        tampered = self.RAW.replace(b"0.85", b"0.99")
        assert post(tampered, signature=sign(self.RAW)).status_code == 401

    @pytest.mark.parametrize(
        "mutate",
        [
            lambda s: s[:62],
            lambda s: s + "ab",
            lambda s: "z" * 64,
            lambda s: "sha256=" + s,
            lambda s: s[:63] + "\n",
        ],
    )
    def test_malformed_signatures(self, mutate):
        assert post(self.RAW, signature=mutate(sign(self.RAW))).status_code == 401

    def test_reserialized_body_is_not_what_is_signed(self):
        raw = b'{"a": 1}'
        assert post(raw, signature=sign(b'{"a":1}')).status_code == 401


class TestAfterVerification:
    def test_non_json_is_400(self):
        assert post("not json").status_code == 400

    @pytest.mark.parametrize("body", ["[]", '"x"', "42", "null"])
    def test_non_object_json_is_400(self, body):
        assert post(body).status_code == 400

    def test_missing_event_type_is_400(self):
        assert post("{}", event_type=None).status_code == 400

    @pytest.mark.parametrize(
        "event_type,payload",
        [
            ("ScoreCreatedIntegrationEvent", {"type": 5, "state": {}, "score": "x"}),
            ("BiomarkerCreatedIntegrationEvent", {"type": [], "value": 1, "unit": None}),
            ("ArchetypeCreatedIntegrationEvent", {"name": {}, "value": []}),
            ("TagReceivedIntegrationEvent", {"name": 1, "type": None}),
            ("DataLogReceivedIntegrationEvent", {"dataLogs": "nope"}),
            ("DataLogReceivedIntegrationEvent", {"dataLogs": [1, None, "x", []]}),
            ("DataLogReceivedIntegrationEvent", {"dataLogs": {"a": 1}, "dataType": 7}),
        ],
    )
    def test_wrong_typed_fields_do_not_500(self, event_type, payload):
        assert post(json.dumps(payload), event_type=event_type).status_code == 200


def test_fails_closed_without_secret(monkeypatch):
    monkeypatch.delenv("SAHHA_WEBHOOK_SECRET", raising=False)
    assert post(json.dumps(EVENTS["ScoreCreatedIntegrationEvent"])).status_code == 500


def test_health():
    assert client.get("/health").status_code == 200
