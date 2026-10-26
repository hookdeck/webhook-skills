import base64
import hashlib
import hmac
import json
import os

from fastapi.testclient import TestClient

os.environ["STORYLANE_WEBHOOK_SECRET"] = "storylane_test_verification_secret"

from main import app, verify_storylane_signature  # noqa: E402

SECRET = os.environ["STORYLANE_WEBHOOK_SECRET"]
client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


# Payload as shown in Storylane's docs (demo_viewed)
DEMO_VIEWED_OBJ = {
    "id": "a61a8af4-8a33-4b4d-9861-d8542bcb4d36",
    "analytics_url": "https://app.storylane.io/audience/sessions/a61a8af4-8a33-4b4d-9861-d8542bcb4d36",
    "buyer_reveal": {
        "company_name": "Acme Inc",
        "company_domain": "example.com",
        "company_annual_revenue_range": "$1B-$10B",
        "company_employee_range": "1K-5K",
        "confidence_score": "low",
    },
    "checklist_completed": False,
    "completion": 100,
    "cta_opened": None,
    "host_url": "https://app.storylane.io/share/lcmplr8qd0rj",
    "intent_level": "high",
    "lead": {
        "id": "dcc7997a-c811-4778-a065-cc009ad6b46e",
        "client_source": "none",
        "client_tracking_id": None,
        "email": "webhooktest@test.com",
        "first_name": "",
        "last_name": "",
        "lead_source": "Nurtured",
    },
    "link": "https://app.storylane.io/share/lcmplr8qd0rj",
    "link_name": "Default",
    "location": {"city": "Pune", "country": "India", "state": "MH"},
    "name": "test for Pardot",
    "referers": ["https://app.storylane.io/share/lcmplr8qd0rj?email=webhooktest@test.com"],
    "time_spent": 10,
    "utm_params": {},
    "viewed_at": "2026-05-20T03:27:29.246-07:00",
    "event": "demo_viewed",
}
DEMO_VIEWED = json.dumps(DEMO_VIEWED_OBJ).encode()
ANONYMOUS = json.dumps({**DEMO_VIEWED_OBJ, "lead": None}).encode()
UNKNOWN_EVENT = json.dumps({"id": "x", "event": "something_else"}).encode()


def post(body: bytes, signature: str | None = None, content_type: str = "application/json"):
    headers = {"content-type": content_type}
    if signature is not None:
        headers["x-storylane-signature"] = signature
    return client.post("/webhooks/storylane", content=body, headers=headers)


class TestVerify:
    def test_valid(self):
        assert verify_storylane_signature(DEMO_VIEWED, sign(DEMO_VIEWED), SECRET)

    def test_wrong_secret_tampered_missing_empty(self):
        assert not verify_storylane_signature(DEMO_VIEWED, sign(DEMO_VIEWED, "other"), SECRET)
        assert not verify_storylane_signature(DEMO_VIEWED + b" ", sign(DEMO_VIEWED), SECRET)
        assert not verify_storylane_signature(DEMO_VIEWED, None, SECRET)
        assert not verify_storylane_signature(DEMO_VIEWED, "", SECRET)

    def test_malformed_values(self):
        sig = sign(DEMO_VIEWED)
        assert not verify_storylane_signature(DEMO_VIEWED, sig[:-1], SECRET)
        assert not verify_storylane_signature(DEMO_VIEWED, "sha256=" + sig, SECRET)
        assert not verify_storylane_signature(DEMO_VIEWED, sig + sig, SECRET)
        assert not verify_storylane_signature(DEMO_VIEWED, sig[:40] + "!!!=", SECRET)
        assert not verify_storylane_signature(DEMO_VIEWED, " " + sig, SECRET)
        assert not verify_storylane_signature(DEMO_VIEWED, sig + "\n", SECRET)
        assert not verify_storylane_signature(DEMO_VIEWED, "é" * 44, SECRET)

    def test_rejects_non_canonical_base64(self):
        sig = sign(DEMO_VIEWED)
        alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        alt = alphabet[alphabet.index(sig[42]) ^ 1]  # flips an unused low bit
        variant = sig[:42] + alt + "="
        assert base64.b64decode(variant, validate=True) == base64.b64decode(sig, validate=True)
        assert not verify_storylane_signature(DEMO_VIEWED, variant, SECRET)


class TestWebhook:
    def test_demo_viewed(self):
        res = post(DEMO_VIEWED, sign(DEMO_VIEWED))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_demo_viewed_without_lead(self):
        assert post(ANONYMOUS, sign(ANONYMOUS)).status_code == 200

    def test_unknown_event(self):
        assert post(UNKNOWN_EVENT, sign(UNKNOWN_EVENT)).status_code == 200

    def test_any_content_type(self):
        assert post(DEMO_VIEWED, sign(DEMO_VIEWED), "text/plain").status_code == 200

    def test_exact_bytes_not_reserialised(self):
        spaced = json.dumps(DEMO_VIEWED_OBJ, indent=2).encode()
        assert post(spaced, sign(spaced)).status_code == 200
        assert post(spaced, sign(DEMO_VIEWED)).status_code == 401

    def test_bad_signatures_are_401(self):
        assert post(DEMO_VIEWED).status_code == 401
        assert post(DEMO_VIEWED, "").status_code == 401
        assert post(DEMO_VIEWED, sign(DEMO_VIEWED, "other")).status_code == 401
        assert post(DEMO_VIEWED, "not-base64").status_code == 401

    def test_signed_non_object_is_400(self):
        for body in (b"not json", b"[1]", b"null"):
            assert post(body, sign(body)).status_code == 400
