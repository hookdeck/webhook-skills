import hashlib
import hmac
import itertools
import json
import os

import pytest
from fastapi.testclient import TestClient

# Attio webhook secrets are 64-char hex strings, used as-is (UTF-8) as the HMAC key
SECRET = "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb"
os.environ["ATTIO_WEBHOOK_SECRET"] = SECRET

from main import app, verify_attio_signature  # noqa: E402

client = TestClient(app)
_key_counter = itertools.count()


def sign_attio(payload: str | bytes, secret: str = SECRET) -> str:
    """Sign a payload exactly like Attio: hex HMAC-SHA256 of the raw body."""
    body = payload.encode("utf-8") if isinstance(payload, str) else payload
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


def attio_payload(event_type: str, **extra) -> str:
    event = {
        "event_type": event_type,
        "id": {
            "workspace_id": "14beef7a-99f7-4534-a87e-70b564330a4c",
            "object_id": "97052eb9-e65e-443f-a297-f2d9a4a7f795",
            "record_id": "bf071e1f-6035-429d-b874-d83ea64ea13b",
        },
        "actor": {"type": "workspace-member", "id": "50cf242c-7fa3-4cad-87d0-75b1af71c57b"},
        **extra,
    }
    return json.dumps({"webhook_id": "23e42eaf-323a-41da-b5bb-fd67eebda553", "events": [event]})


def new_key() -> str:
    return f"idem-{next(_key_counter)}"


def post(payload: str, headers: dict | None = None):
    return client.post(
        "/webhooks/attio",
        content=payload,
        headers={"Content-Type": "application/json", **(headers or {})},
    )


class TestVerifyAttioSignature:
    body = attio_payload("record.created").encode()

    def test_valid_signature(self):
        assert verify_attio_signature(self.body, sign_attio(self.body), SECRET) is True

    def test_uppercase_hex_signature(self):
        assert verify_attio_signature(self.body, sign_attio(self.body).upper(), SECRET) is True

    def test_wrong_secret(self):
        assert verify_attio_signature(self.body, sign_attio(self.body, "wrong_secret"), SECRET) is False

    def test_tampered_body(self):
        tampered = attio_payload("record.deleted").encode()
        assert verify_attio_signature(tampered, sign_attio(self.body), SECRET) is False

    def test_malformed_signatures(self):
        assert verify_attio_signature(self.body, "invalid", SECRET) is False
        assert verify_attio_signature(self.body, f"sha256={sign_attio(self.body)}", SECRET) is False
        assert verify_attio_signature(self.body, "é" * 64, SECRET) is False

    def test_missing_signature_or_secret(self):
        assert verify_attio_signature(self.body, None, SECRET) is False
        assert verify_attio_signature(self.body, sign_attio(self.body), None) is False


class TestAttioWebhook:
    def test_missing_signature_returns_400(self):
        response = post(attio_payload("record.created"))
        assert response.status_code == 400
        assert response.json()["detail"] == "Missing signature header"

    def test_invalid_signature_returns_400(self):
        response = post(attio_payload("record.created"), {"Attio-Signature": "a" * 64})
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid signature"

    def test_modified_body_returns_400(self):
        sig = sign_attio(attio_payload("record.created"))
        response = post(attio_payload("record.deleted"), {"Attio-Signature": sig})
        assert response.status_code == 400

    def test_valid_signature_returns_200(self):
        payload = attio_payload("record.created")
        response = post(payload, {"Attio-Signature": sign_attio(payload), "Idempotency-Key": new_key()})
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_legacy_x_attio_signature_header(self):
        payload = attio_payload(
            "list-entry.updated",
            id={
                "workspace_id": "14beef7a-99f7-4534-a87e-70b564330a4c",
                "list_id": "33ebdbe9-e529-47c9-b894-0ba25e9c15c0",
                "entry_id": "2e6e29ea-c4e0-4f44-842d-78a891f8c156",
                "attribute_id": "41252299-f8c7-4b5e-99c9-4ff8321d2f96",
            },
        )
        response = post(payload, {"X-Attio-Signature": sign_attio(payload)})
        assert response.status_code == 200

    def test_signed_non_json_body_returns_400(self):
        payload = "not json"
        response = post(payload, {"Attio-Signature": sign_attio(payload)})
        assert response.status_code == 400
        assert response.json()["detail"] == "Invalid JSON"

    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("ATTIO_WEBHOOK_SECRET")
        payload = attio_payload("record.created")
        response = post(payload, {"Attio-Signature": sign_attio(payload)})
        assert response.status_code == 500

    @pytest.mark.parametrize(
        "event_type",
        [
            "record.created",
            "record.updated",
            "record.deleted",
            "record.merged",
            "list-entry.created",
            "list-entry.updated",
            "list-entry.deleted",
            "note.created",
            "task.created",
            "comment.created",
            "workspace-member.created",
        ],
    )
    def test_handles_event_types(self, event_type):
        payload = attio_payload(event_type)
        response = post(payload, {"Attio-Signature": sign_attio(payload), "Idempotency-Key": new_key()})
        assert response.status_code == 200

    def test_duplicate_idempotency_key_is_skipped(self):
        payload = attio_payload("record.created")
        headers = {"Attio-Signature": sign_attio(payload), "Idempotency-Key": new_key()}

        first = post(payload, headers)
        assert first.json() == {"received": True}

        retry = post(payload, headers)
        assert retry.status_code == 200
        assert retry.json() == {"received": True, "duplicate": True}


class TestHealth:
    def test_health_returns_ok(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
