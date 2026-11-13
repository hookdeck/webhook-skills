import hashlib
import hmac
import json
import logging
import os

from fastapi.testclient import TestClient

# A signing key for tests only
SECRET = "test_certn_signing_key_3b7d"
os.environ["CERTN_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: str, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


# Content-Type is deliberately varied: verification must not depend on it
def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["X-Signature"] = signature
    return client.post("/webhooks/certn", content=body, headers=headers)


# Certn's documented CASE_STATUS_CHANGED example
CASE_STATUS_CHANGED = json.dumps({
    "created": "2024-06-27T12:00:00Z",
    "event_id": "1712aea0-77a4-425c-9649-7f544a3de477",
    "event_type": "CASE_STATUS_CHANGED",
    "object_id": "2f64d134-1c54-4028-8e8b-9cfa7bd8011c",
    "object_type": "CASE",
    "case_status": "CLIENT_ACTION_REQUIRED",
})

CHECK_STATUS_CHANGED = json.dumps({
    "created": "2024-06-27T12:00:00Z",
    "event_id": "e50b8c4f-9a95-40a0-886a-37aa21ea078e",
    "event_type": "CHECK_STATUS_CHANGED",
    "object_id": "2f64d134-1c54-4028-8e8b-9cfa7bd8011c",
    "object_type": "CASE",
    "case_status": "CLIENT_ACTION_REQUIRED",
    "triggered_check": {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "type": "UK_MANUAL_IDENTITY_VERIFICATION_1",
        "status": "CLIENT_ACTION_REQUIRED",
        "action_required_resolution": {
            "summary": "Complete UK Manual Identity Verification", "step_count": 0, "steps": [],
        },
    },
})


def event_of(event_type: str, **extra) -> str:
    return json.dumps({
        "created": "2024-06-27T12:00:00Z",
        "event_id": "3c2f1a9d-7b54-4e21-9f0c-5d6a8b3e21fa",
        "event_type": event_type,
        "object_id": "2f64d134-1c54-4028-8e8b-9cfa7bd8011c",
        "object_type": "CASE",
        **extra,
    })


class TestChallenge:
    def test_echoes_challenge_as_plain_text(self):
        r = client.get("/webhooks/certn", params={"challenge": "abc123"})
        assert r.status_code == 200
        assert r.text == "abc123"
        assert r.headers["content-type"].startswith("text/plain")
        assert r.headers["x-content-type-options"] == "nosniff"

    def test_rejects_get_without_challenge(self):
        assert client.get("/webhooks/certn").status_code == 400


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        r = post(CASE_STATUS_CHANGED, sign(CASE_STATUS_CHANGED))
        assert r.status_code == 200
        assert r.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        assert post(CASE_STATUS_CHANGED, sign(CASE_STATUS_CHANGED), "text/plain").status_code == 200

    def test_accepts_uppercase_hex(self):
        assert post(CASE_STATUS_CHANGED, sign(CASE_STATUS_CHANGED).upper()).status_code == 200

    def test_rejects_missing_signature(self):
        assert post(CASE_STATUS_CHANGED).status_code == 403

    def test_rejects_wrong_key(self):
        assert post(CASE_STATUS_CHANGED, sign(CASE_STATUS_CHANGED, "wrong_key")).status_code == 403

    def test_rejects_tampered_body(self):
        tampered = CASE_STATUS_CHANGED.replace("CLIENT_ACTION_REQUIRED", "COMPLETE")
        assert post(tampered, sign(CASE_STATUS_CHANGED)).status_code == 403

    def test_rejects_malformed_signature_without_error(self):
        assert post(CASE_STATUS_CHANGED, "zz" * 32).status_code == 403
        assert post(CASE_STATUS_CHANGED, "abcd").status_code == 403
        assert post(CASE_STATUS_CHANGED, sign(CASE_STATUS_CHANGED) + "00").status_code == 403
        assert post(CASE_STATUS_CHANGED, "sha256=" + sign(CASE_STATUS_CHANGED)).status_code == 403

    def test_non_ascii_header_is_403_not_500(self):
        r = client.post(
            "/webhooks/certn",
            content=CASE_STATUS_CHANGED,
            headers={"Content-Type": "application/json", "X-Signature": "é".encode("latin-1")},
        )
        assert r.status_code == 403

    def test_invalid_json_with_valid_signature_is_400(self):
        assert post("not json", sign("not json")).status_code == 400


class TestDispatch:
    def test_case_status_changed(self, caplog):
        with caplog.at_level(logging.INFO, logger="certn-webhooks"):
            post(CASE_STATUS_CHANGED, sign(CASE_STATUS_CHANGED))
        assert "status: CLIENT_ACTION_REQUIRED" in caplog.text

    def test_check_status_changed_with_client_action(self, caplog):
        with caplog.at_level(logging.INFO, logger="certn-webhooks"):
            post(CHECK_STATUS_CHANGED, sign(CHECK_STATUS_CHANGED))
        assert "check UK_MANUAL_IDENTITY_VERIFICATION_1 status: CLIENT_ACTION_REQUIRED" in caplog.text
        assert "Client action required" in caplog.text

    def test_case_report_ready(self, caplog):
        body = event_of("CASE_REPORT_READY", case_status="COMPLETE")
        with caplog.at_level(logging.INFO, logger="certn-webhooks"):
            post(body, sign(body))
        assert "report ready" in caplog.text

    def test_case_input_claims_generated(self, caplog):
        body = event_of("CASE_INPUT_CLAIMS_AUTOMATICALLY_GENERATED", case_status="IN_PROGRESS")
        with caplog.at_level(logging.INFO, logger="certn-webhooks"):
            post(body, sign(body))
        assert "new input claims" in caplog.text

    def test_unknown_event_acknowledged(self, caplog):
        body = event_of("SOMETHING_NEW")
        with caplog.at_level(logging.INFO, logger="certn-webhooks"):
            r = post(body, sign(body))
        assert r.status_code == 200
        assert "Unhandled event type: SOMETHING_NEW" in caplog.text

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
