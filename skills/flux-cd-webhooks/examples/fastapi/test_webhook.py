import os
import json
import hmac
import hashlib

import pytest
from fastapi.testclient import TestClient

os.environ["FLUX_CD_WEBHOOK_SECRET"] = "test_flux_cd_token"

from main import app, verify_flux_webhook  # noqa: E402

client = TestClient(app)
SECRET = os.environ["FLUX_CD_WEBHOOK_SECRET"]

# Payload as shown in the Flux notification-controller docs (generic webhook)
ERROR_EVENT = {
    "involvedObject": {
        "apiVersion": "kustomize.toolkit.fluxcd.io/v1",
        "kind": "Kustomization",
        "name": "webapp",
        "namespace": "apps",
        "uid": "7d0cdc51-ddcf-4743-b223-83ca5c699632",
    },
    "metadata": {"kustomize.toolkit.fluxcd.io/revision": "main/731f7eaddfb6af01cb2173e18f0f75b0ba780ef1"},
    "severity": "error",
    "reason": "ValidationFailed",
    "message": "service/apps/webapp validation error: spec.type: Unsupported value: Ingress",
    "reportingController": "kustomize-controller",
    "reportingInstance": "kustomize-controller-7c7b47f5f-8bhrp",
    "timestamp": "2022-10-28T07:26:19Z",
}
INFO_EVENT = {**ERROR_EVENT, "severity": "info", "reason": "ReconciliationSucceeded", "message": "Reconciliation finished"}


def sign(payload: bytes, secret: str = SECRET) -> str:
    """Flux's X-Signature is `sha256=` + hex HMAC-SHA256 of the raw body."""
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def send(body: bytes, signature: str | None = "auto"):
    headers = {"Content-Type": "application/json"}
    if signature == "auto":
        signature = f"sha256={sign(body)}"
    if signature is not None:
        headers["X-Signature"] = signature
    return client.post("/webhooks/flux-cd", content=body, headers=headers)


class TestVerifyFluxWebhook:
    payload = b'{"severity":"info"}'

    def test_accepts_prefixed_bare_and_uppercase(self):
        digest = sign(self.payload)
        assert verify_flux_webhook(self.payload, f"sha256={digest}", SECRET)
        assert verify_flux_webhook(self.payload, digest, SECRET)
        assert verify_flux_webhook(self.payload, f"sha256={digest.upper()}", SECRET)

    @pytest.mark.parametrize("signature", [None, "", "sha256=", "sha256=deadbeef", "sha256=" + "zz" * 32])
    def test_rejects_missing_empty_and_malformed(self, signature):
        assert not verify_flux_webhook(self.payload, signature, SECRET)

    def test_rejects_other_hash_functions(self):
        sha512 = hmac.new(SECRET.encode(), self.payload, hashlib.sha512).hexdigest()
        assert not verify_flux_webhook(self.payload, f"sha512={sha512}", SECRET)

    def test_rejects_wrong_secret_tampered_body_and_no_secret(self):
        digest = sign(self.payload)
        assert not verify_flux_webhook(self.payload, f"sha256={sign(self.payload, 'wrong')}", SECRET)
        assert not verify_flux_webhook(b'{"severity":"error"}', f"sha256={digest}", SECRET)
        assert not verify_flux_webhook(self.payload, f"sha256={digest}", "")


class TestWebhookEndpoint:
    def test_missing_signature_returns_401(self):
        assert send(json.dumps(ERROR_EVENT).encode(), None).status_code == 401

    def test_empty_signature_returns_401(self):
        assert send(json.dumps(ERROR_EVENT).encode(), "").status_code == 401

    def test_malformed_signature_returns_401(self):
        assert send(json.dumps(ERROR_EVENT).encode(), "sha256=deadbeef").status_code == 401

    def test_wrong_secret_returns_401(self):
        body = json.dumps(ERROR_EVENT).encode()
        assert send(body, f"sha256={sign(body, 'wrong_secret')}").status_code == 401

    def test_body_changed_after_signing_returns_401(self):
        signature = f"sha256={sign(json.dumps(ERROR_EVENT).encode())}"
        assert send(json.dumps(INFO_EVENT).encode(), signature).status_code == 401

    @pytest.mark.parametrize("event", [ERROR_EVENT, INFO_EVENT], ids=["error", "info"])
    def test_valid_event_returns_200(self, event):
        response = send(json.dumps(event).encode())
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_verifies_exact_bytes(self):
        assert send(json.dumps(ERROR_EVENT, indent=2).encode()).status_code == 200

    def test_bare_hex_signature_is_accepted(self):
        body = json.dumps(INFO_EVENT).encode()
        assert send(body, sign(body)).status_code == 200

    def test_signed_non_json_returns_400(self):
        assert send(b"not json").status_code == 400

    def test_health(self):
        assert client.get("/health").json() == {"status": "ok"}
