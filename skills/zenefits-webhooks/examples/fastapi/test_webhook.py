import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Example from the Zenefits docs
DOC_SECRET = "lDVtBQnoRcqYv4fUeVD0oyzgsKWHGtqhatjBX5wXRFQzkVUCzBA571E4qUxvR5LE"
DOC_BODY = '{"test":"valid payload"}'
DOC_SIGNATURE = "219a08ea32f319931dc849badc076323f40367aad859ddba4de82e33135fad31"

os.environ["ZENEFITS_WEBHOOK_SECRET"] = DOC_SECRET

from main import app, verify_zenefits_signature  # noqa: E402

client = TestClient(app)


def sign(body: str, secret: str = DOC_SECRET) -> str:
    """Same algorithm as Zenefits: hex(HMAC-SHA256(body, secret))."""
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


def post(body: str, signature: str | bytes | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["signature"] = signature
    return client.post("/webhooks/zenefits", content=body.encode(), headers=headers)


def event(event_type: str) -> str:
    return json.dumps({"object": "/meta/event", "type": event_type, "data": {"id": "1", "object": "/core/people"}})


class TestVerifyZenefitsSignature:
    def test_matches_docs_example(self):
        assert sign(DOC_BODY) == DOC_SIGNATURE
        assert verify_zenefits_signature(DOC_BODY.encode(), DOC_SIGNATURE, DOC_SECRET)

    def test_accepts_uppercase_hex(self):
        assert verify_zenefits_signature(DOC_BODY.encode(), DOC_SIGNATURE.upper(), DOC_SECRET)

    def test_rejects_bad_values(self):
        body = DOC_BODY.encode()
        assert not verify_zenefits_signature(body, sign(DOC_BODY, "other"), DOC_SECRET)
        assert not verify_zenefits_signature(body, None, DOC_SECRET)
        assert not verify_zenefits_signature(body, "short", DOC_SECRET)
        assert not verify_zenefits_signature(body, DOC_SIGNATURE, None)

    def test_non_ascii_signature_returns_false(self):
        assert verify_zenefits_signature(DOC_BODY.encode(), "é" * 64, DOC_SECRET) is False


class TestWebhookEndpoint:
    @pytest.mark.parametrize(
        "event_type",
        [
            "companies.did_change",
            "people.did_create",
            "people.did_change",
            "employments.did_start",
            "employments.did_terminate",
            "flow.did_complete.hiring",
            "departments.did_create",
        ],
    )
    def test_accepts_valid_signature(self, event_type):
        body = event(event_type)
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        body = event("people.did_create")
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_rejects_invalid_signature(self):
        assert post(event("people.did_create"), sign("tampered")).status_code == 401

    def test_rejects_missing_signature(self):
        assert post(event("people.did_create")).status_code == 401

    def test_rejects_modified_body(self):
        signature = sign(event("people.did_create"))
        assert post(event("people.did_change"), signature).status_code == 401

    def test_non_ascii_signature_header_gives_401(self):
        res = client.post(
            "/webhooks/zenefits",
            content=event("people.did_create").encode(),
            headers={"Content-Type": "application/json", "signature": ("é" * 32).encode("utf-8")},
        )
        assert res.status_code == 401

    def test_signed_non_json_body_gives_400(self):
        body = "not json"
        assert post(body, sign(body), "text/plain").status_code == 400

    def test_signed_json_non_object_gives_400(self):
        body = "[1, 2]"
        assert post(body, sign(body)).status_code == 400
