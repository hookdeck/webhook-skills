import hashlib
import hmac
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# Veriff's docs mock shared secret key (webhooks-guide, "Mock payload and shared secret key")
DOCS_SECRET = "abcdef12-abcd-abcd-abcd-abcdef012345"
os.environ["VERIFF_SHARED_SECRET"] = DOCS_SECRET

from main import app, verify_veriff_signature  # noqa: E402

client = TestClient(app)

# Compact JSON of the decision webhook mock payload from Veriff's docs
DOCS_PAYLOAD = (Path(__file__).parent / "fixtures" / "docs-mock-payload.json").read_bytes()
# Signature published in the docs' curl example for that payload
DOCS_SIGNATURE = "01fa3ded011bfce75672c99877a6cc1cf7aeaeda0ccb6b43fc21b60f595063c2"


def sign(body: bytes, secret: str = DOCS_SECRET) -> str:
    """Same algorithm as Veriff: hex HMAC-SHA256 of the raw body."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def decision(status: str) -> bytes:
    return json.dumps(
        {
            "status": "success",
            "verification": {
                "id": "12df6045-3846-3e45-946a-14fa6136d78b",
                "attemptId": "00bca969-b53a-4fad-b065-874d41a7b2b8",
                "vendorData": "12345678",
                "status": status,
                "code": 9001,
                "reason": None,
            },
            "technicalData": {"ip": "186.153.67.122"},
        }
    ).encode()


def event(action: str, code: int) -> bytes:
    return json.dumps(
        {
            "id": "f04bdb47-d3be-4b28-b028-a652feb060b5",
            "attemptId": "e30122d1-740b-4764-853f-470374a7abf4",
            "feature": "selfid",
            "code": code,
            "action": action,
            "vendorData": "12345678",
            "endUserId": "a1b2c35d-e8f7-6d5e-3cd2-a1b2c35db3d4",
        }
    ).encode()


def post(body: bytes, headers: dict | None = None):
    return client.post(
        "/webhooks/veriff",
        content=body,
        headers={"content-type": "application/json", **(headers or {})},
    )


class TestVerifyVeriffSignature:
    def test_matches_docs_test_vector(self):
        assert sign(DOCS_PAYLOAD) == DOCS_SIGNATURE
        assert verify_veriff_signature(DOCS_PAYLOAD, DOCS_SIGNATURE, DOCS_SECRET)

    def test_accepts_uppercase_hex(self):
        body = decision("approved")
        assert verify_veriff_signature(body, sign(body).upper(), DOCS_SECRET)

    def test_rejects_wrong_secret(self):
        body = decision("approved")
        assert not verify_veriff_signature(body, sign(body, "other-secret"), DOCS_SECRET)

    def test_rejects_tampered_body(self):
        assert not verify_veriff_signature(decision("declined"), sign(decision("approved")), DOCS_SECRET)

    def test_rejects_missing_or_malformed(self):
        body = decision("approved")
        assert not verify_veriff_signature(body, None, DOCS_SECRET)
        assert not verify_veriff_signature(body, "short", DOCS_SECRET)


class TestWebhookEndpoint:
    def test_accepts_docs_mock_payload(self, capsys):
        res = post(DOCS_PAYLOAD, {"X-HMAC-SIGNATURE": DOCS_SIGNATURE})
        assert res.status_code == 200
        assert "Verification approved" in capsys.readouterr().out

    def test_missing_signature_returns_400(self):
        res = post(decision("approved"))
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing X-HMAC-SIGNATURE header"

    def test_invalid_signature_returns_400(self):
        res = post(decision("approved"), {"X-HMAC-SIGNATURE": "f" * 64})
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_x_auth_client_alone_is_not_accepted(self):
        res = post(decision("approved"), {"X-AUTH-CLIENT": "8e4f7cd8-7a19-4d7d-971f-a076407ee03c"})
        assert res.status_code == 400

    def test_invalid_json_returns_400(self):
        body = b"not json"
        res = post(body, {"X-HMAC-SIGNATURE": sign(body)})
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid JSON"

    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("VERIFF_SHARED_SECRET")
        body = decision("approved")
        res = post(body, {"X-HMAC-SIGNATURE": sign(body)})
        assert res.status_code == 500

    @pytest.mark.parametrize(
        "status",
        ["approved", "declined", "resubmission_requested", "review", "expired", "abandoned"],
    )
    def test_handles_decision_status(self, status, capsys):
        body = decision(status)
        res = post(body, {"X-HMAC-SIGNATURE": sign(body)})
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    @pytest.mark.parametrize(
        "action,code",
        [
            ("started", 7001),
            ("submitted", 7002),
            ("waiting_complete", 7007),
            ("waiting_continued", 7008),
            ("flow_finished", 7009),
            ("flow_cancelled", 7010),
            ("document_type_other_selected", 7011),
        ],
    )
    def test_handles_event_action(self, action, code, capsys):
        body = event(action, code)
        res = post(body, {"X-HMAC-SIGNATURE": sign(body)})
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_event_action(self, capsys):
        body = event("something_new", 7999)
        res = post(body, {"X-HMAC-SIGNATURE": sign(body)})
        assert res.status_code == 200
        assert "Unhandled event action" in capsys.readouterr().out
