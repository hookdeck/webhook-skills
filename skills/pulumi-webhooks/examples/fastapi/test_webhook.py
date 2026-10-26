import hashlib
import hmac
import json
import logging
import os

import pytest
from fastapi.testclient import TestClient

# The shared secret is any string you choose on the Pulumi webhook; it is used as UTF-8 bytes as-is
SECRET = "test_pulumi_shared_secret_7c1d"
os.environ["PULUMI_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: str, secret=SECRET) -> str:
    # Bare lowercase hex HMAC-SHA256 of the raw body, no prefix
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


def post(body: str, signature=None, kind="stack_update", content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["Pulumi-Webhook-Signature"] = signature
    if kind:
        headers["Pulumi-Webhook-Kind"] = kind
    return client.post("/webhooks/pulumi", content=body, headers=headers)


# Payloads follow the examples in Pulumi's webhook docs
USER = {"name": "Morty Smith", "githubLogin": "morty", "avatarUrl": "https://crazy-adventures.net/morty.png"}
ORG = {"name": "Crazy Adventures", "githubLogin": "crazy-adventures", "avatarUrl": "https://crazy-adventures.net/logo.png"}
BASE = {"user": USER, "organization": ORG, "projectName": "website", "stackName": "website-prod"}

PAYLOADS = {
    "stack": {**BASE, "action": "created"},
    "stack_update": {
        **BASE,
        "updateUrl": "https://app.pulumi.com/crazy-adventures/website/website-prod/updates/42",
        "kind": "refresh",
        "result": "succeeded",
        "resourceChanges": {"update": 3, "delete": 1, "update-replace": 2},
        "isPreview": False,
    },
    "stack_preview": {
        **BASE,
        "updateUrl": "https://app.pulumi.com/crazy-adventures/website/website-prod/previews/11bf162b-d9d5-4715-8f88-20dcd0e0b167",
        "kind": "update",
        "result": "failed",
        "resourceChanges": {"update": 3, "delete": 1, "update-replace": 2},
        "isPreview": True,
    },
    "deployment": {
        **BASE,
        "deploymentUrl": "https://app.pulumi.com/crazy-adventures/website/website-prod/deployments/127",
        "version": 127,
        "operation": "update",
        "status": "running",
    },
    "drift_detection": {
        **BASE,
        "driftDetected": True,
        "driftRunId": "11bf162b-d9d5-4715-8f88-20dcd0e0b167",
        "status": "succeeded",
        "resourceChanges": {"update": 3, "delete": 1},
        "referenceUrl": "https://app.pulumi.com/crazy-adventures/website/website-prod/deployments/127",
    },
    "drift_remediation": {
        **BASE,
        "status": "succeeded",
        "resourceChanges": {"update": 3, "delete": 1},
        "referenceUrl": "https://app.pulumi.com/crazy-adventures/website/website-prod/deployments/128",
    },
}

BODY = json.dumps(PAYLOADS["stack_update"])


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(BODY, sign(BODY))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        assert post(BODY, sign(BODY), content_type="text/plain").status_code == 200

    def test_verifies_exact_bytes_including_whitespace(self):
        pretty = json.dumps(PAYLOADS["stack_update"], indent=2)
        assert post(pretty, sign(pretty)).status_code == 200
        assert post(pretty, sign(BODY)).status_code == 401

    def test_accepts_uppercase_hex(self):
        assert post(BODY, sign(BODY).upper()).status_code == 200

    def test_rejects_missing_header(self):
        assert post(BODY).status_code == 401

    def test_rejects_empty_header(self):
        assert post(BODY, "").status_code == 401

    def test_rejects_tampered_body(self):
        assert post(BODY.replace("succeeded", "failed"), sign(BODY)).status_code == 401

    def test_rejects_wrong_secret(self):
        assert post(BODY, sign(BODY, "other_secret")).status_code == 401

    def test_rejects_malformed_signature(self):
        assert post(BODY, "abc").status_code == 401
        assert post(BODY, "zz" * 32).status_code == 401
        assert post(BODY, f"sha256={sign(BODY)}").status_code == 401
        assert post(BODY, sign(BODY) + sign(BODY)).status_code == 401

    def test_rejects_non_ascii_header_without_500(self):
        # httpx only encodes ASCII str headers, so send the raw UTF-8 bytes
        assert post(BODY, ("é" + "a" * 63).encode("utf-8")).status_code == 401


class TestEvents:
    @pytest.mark.parametrize("kind", list(PAYLOADS))
    def test_dispatch(self, caplog, kind):
        body = json.dumps(PAYLOADS[kind])
        with caplog.at_level(logging.INFO, logger="pulumi-webhooks"):
            res = post(body, sign(body), kind=kind)
        assert res.status_code == 200
        assert "Unhandled" not in caplog.text

    def test_logs_action_result_and_status(self, caplog):
        with caplog.at_level(logging.INFO, logger="pulumi-webhooks"):
            for kind in ("stack", "stack_update", "deployment"):
                body = json.dumps(PAYLOADS[kind])
                post(body, sign(body), kind=kind)
        assert "Stack created: website/website-prod" in caplog.text
        assert "Stack update (refresh) succeeded" in caplog.text
        assert "Deployment 127 update running" in caplog.text

    def test_acknowledges_policy_violation_and_missing_kind(self, caplog):
        body = json.dumps({**BASE, "policyPack": "aws-guardrails"})
        with caplog.at_level(logging.INFO, logger="pulumi-webhooks"):
            assert post(body, sign(body), kind="policy_violation").status_code == 200
            assert post(body, sign(body), kind=None).status_code == 200
        assert "Unhandled event kind: policy_violation" in caplog.text
        assert "Unhandled event kind: None" in caplog.text

    def test_rejects_verified_but_invalid_json(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400

    def test_rejects_verified_non_object_json(self):
        body = "[1, 2]"
        assert post(body, sign(body)).status_code == 400
