import hashlib
import hmac
import json
import os

# Sumsub webhook secret keys are plain strings (generated in the Webhook manager
# or set by you) used verbatim as the HMAC key - no prefix, no base64 decoding.
SECRET = "test_sumsub_secret_key"
os.environ["SUMSUB_WEBHOOK_SECRET"] = SECRET

import pytest
from fastapi.testclient import TestClient

from main import app, verify_sumsub_webhook

client = TestClient(app)

ALGS = {
    "HMAC_SHA1_HEX": hashlib.sha1,
    "HMAC_SHA256_HEX": hashlib.sha256,
    "HMAC_SHA512_HEX": hashlib.sha512,
}

# Fixed vectors computed independently with `openssl dgst -<alg> -hmac test_sumsub_secret_key`
KAT_BODY = '{"applicantId":"5cb56e8e0a975a35f333cb83","type":"applicantReviewed","reviewResult":{"reviewAnswer":"GREEN"},"reviewStatus":"completed"}'
KAT = {
    "HMAC_SHA1_HEX": "3112408230968a6ecbbca1c55cc5f7746efd3e62",
    "HMAC_SHA256_HEX": "88db922f6fc43f1fa954665cd829cf69a558aba0dd1f0b1d0e58158add7d927f",
    "HMAC_SHA512_HEX": "ae5044f070fbb6a7db99dff0577baf422df66a251e516cc00b550193133a81786f1c4b284280dbbe38bb2efbc5d1c1a6b5897a22f495c90c93f7c5df6ff54c3c",
}


def sign(payload: str, digest_alg: str = "HMAC_SHA256_HEX", secret: str = SECRET) -> str:
    """Compute x-payload-digest the way Sumsub does: hex HMAC of the raw body."""
    return hmac.new(secret.encode(), payload.encode(), ALGS[digest_alg]).hexdigest()


def post(payload: str, headers: dict[str, str] | None = None):
    return client.post(
        "/webhooks/sumsub",
        content=payload,
        headers={"content-type": "application/json", **(headers or {})},
    )


def signed_post(payload: str, digest_alg: str = "HMAC_SHA256_HEX"):
    return post(payload, {"x-payload-digest": sign(payload, digest_alg), "x-payload-digest-alg": digest_alg})


class TestVerifySumsubWebhook:
    body = KAT_BODY.encode()

    @pytest.mark.parametrize("alg", list(KAT))
    def test_known_digest(self, alg):
        assert verify_sumsub_webhook(self.body, KAT[alg], alg, SECRET)

    def test_defaults_to_sha256_without_alg_header(self):
        assert verify_sumsub_webhook(self.body, KAT["HMAC_SHA256_HEX"], None, SECRET)
        assert not verify_sumsub_webhook(self.body, KAT["HMAC_SHA1_HEX"], None, SECRET)

    def test_rejects_algorithm_mismatch(self):
        assert not verify_sumsub_webhook(self.body, KAT["HMAC_SHA1_HEX"], "HMAC_SHA256_HEX", SECRET)
        assert not verify_sumsub_webhook(self.body, KAT["HMAC_SHA256_HEX"], "HMAC_SHA512_HEX", SECRET)

    def test_rejects_unknown_algorithm(self):
        assert not verify_sumsub_webhook(self.body, KAT["HMAC_SHA256_HEX"], "HMAC_MD5_HEX", SECRET)

    def test_accepts_upper_case_digest(self):
        assert verify_sumsub_webhook(self.body, KAT["HMAC_SHA256_HEX"].upper(), "HMAC_SHA256_HEX", SECRET)

    def test_rejects_bad_inputs(self):
        assert not verify_sumsub_webhook(self.body, KAT["HMAC_SHA256_HEX"], "HMAC_SHA256_HEX", "other_secret")
        assert not verify_sumsub_webhook(self.body + b" ", KAT["HMAC_SHA256_HEX"], "HMAC_SHA256_HEX", SECRET)
        assert not verify_sumsub_webhook(self.body, None, "HMAC_SHA256_HEX", SECRET)
        assert not verify_sumsub_webhook(self.body, KAT["HMAC_SHA256_HEX"][:40], "HMAC_SHA256_HEX", SECRET)


class TestSumsubEndpoint:
    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("SUMSUB_WEBHOOK_SECRET")
        assert signed_post(KAT_BODY).status_code == 500

    def test_missing_digest_returns_400(self):
        assert post(KAT_BODY).status_code == 400

    def test_invalid_digest_returns_400(self):
        response = post(KAT_BODY, {"x-payload-digest": "deadbeef", "x-payload-digest-alg": "HMAC_SHA256_HEX"})
        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid signature"}

    def test_unsupported_algorithm_returns_400(self):
        response = post(KAT_BODY, {"x-payload-digest": KAT["HMAC_SHA256_HEX"], "x-payload-digest-alg": "HMAC_MD5_HEX"})
        assert response.status_code == 400

    def test_reserialised_body_returns_400(self):
        pretty = json.dumps(json.loads(KAT_BODY), indent=2)
        response = post(pretty, {"x-payload-digest": KAT["HMAC_SHA256_HEX"], "x-payload-digest-alg": "HMAC_SHA256_HEX"})
        assert response.status_code == 400

    @pytest.mark.parametrize("alg", list(ALGS))
    def test_valid_delivery(self, alg):
        response = signed_post(KAT_BODY, alg)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_valid_delivery_without_alg_header(self):
        assert post(KAT_BODY, {"x-payload-digest": KAT["HMAC_SHA256_HEX"]}).status_code == 200

    def test_signed_non_json_returns_400(self):
        response = signed_post("not json")
        assert response.status_code == 400
        assert response.json() == {"detail": "Invalid JSON"}

    @pytest.mark.parametrize(
        "event",
        [
            {"type": "applicantCreated", "reviewStatus": "init"},
            {"type": "applicantPending", "reviewStatus": "pending"},
            {"type": "applicantReviewed", "reviewStatus": "completed", "reviewResult": {"reviewAnswer": "GREEN"}},
            {"type": "applicantReviewed", "reviewStatus": "completed", "reviewResult": {"reviewAnswer": "RED", "reviewRejectType": "RETRY"}},
            {"type": "applicantOnHold", "reviewStatus": "onHold"},
            {"type": "applicantActionPending", "applicantActionId": "65f0c0a1", "reviewStatus": "pending"},
            {"type": "applicantActionReviewed", "applicantActionId": "65f0c0a1", "reviewResult": {"reviewAnswer": "GREEN"}},
            {"type": "applicantReset", "reviewStatus": "init"},
            {"type": "applicantDeleted"},
            {"type": "applicantTagsChanged", "testMode": True},
        ],
        ids=lambda e: e["type"],
    )
    def test_handles_event(self, event):
        payload = json.dumps(
            {
                "applicantId": "5cb56e8e0a975a35f333cb83",
                "externalUserId": "user-123",
                "levelName": "id-and-liveness",
                "sandboxMode": True,
                "createdAtMs": "2026-10-20 13:23:19.111",
                "clientId": "coolClientId",
                **event,
            }
        )
        assert signed_post(payload).status_code == 200


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
