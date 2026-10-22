import os
import json
import hmac
import hashlib

import pytest
from fastapi.testclient import TestClient

# Set test environment variables before importing app
os.environ["TERRAFORM_NOTIFICATION_TOKEN"] = "test_terraform_token"

from main import app, verify_terraform_signature, get_triggers

client = TestClient(app)
TOKEN = os.environ["TERRAFORM_NOTIFICATION_TOKEN"]


def generate_signature(payload: str, token: str) -> str:
    """Generate a valid X-TFE-Notification-Signature (hex HMAC-SHA512 of the raw body)."""
    return hmac.new(token.encode("utf-8"), payload.encode("utf-8"), hashlib.sha512).hexdigest()


def run_payload(trigger: str) -> dict:
    return {
        "payload_version": 1,
        "notification_configuration_id": "nc-AeUQ2zfKZzW9TiGZ",
        "run_url": "https://app.terraform.io/app/acme-org/my-workspace/runs/run-FwnENkvDnrpyFC7M",
        "run_id": "run-FwnENkvDnrpyFC7M",
        "workspace_id": "ws-XdeUVMWShTesDMME",
        "workspace_name": "my-workspace",
        "organization_name": "acme-org",
        "notifications": [{"message": "Run Applied", "trigger": trigger, "run_status": "applied"}],
    }


VERIFICATION_PAYLOAD = {
    "payload_version": 1,
    "notification_configuration_id": "nc-jWvVsmp5VxsaCeXm",
    "run_id": None,
    "workspace_name": None,
    "notifications": [{"message": "Verification of test", "trigger": "verification", "run_status": None}],
}

DRIFT_PAYLOAD = {
    "payload_version": "2",
    "notification_configuration_id": "nc-SZ3V3cLFxK6sqLKn",
    "trigger_scope": "assessment",
    "trigger": "assessment:drifted",
    "message": "Drift Detected",
    "details": {"workspace_name": "my-workspace", "organization_name": "acme-org"},
}


def post(body, signature=None, content_type="application/json"):
    raw = body if isinstance(body, str) else json.dumps(body)
    headers = {"Content-Type": content_type}
    sig = generate_signature(raw, TOKEN) if signature is None else signature
    if sig:
        headers["X-TFE-Notification-Signature"] = sig
    return client.post("/webhooks/terraform", content=raw, headers=headers)


class TestVerifyTerraformSignature:
    def test_valid_signature_returns_true(self):
        payload = b'{"payload_version":1}'
        signature = generate_signature(payload.decode(), TOKEN)
        assert verify_terraform_signature(payload, signature, TOKEN) is True

    def test_uppercase_hex_signature_returns_true(self):
        payload = b'{"payload_version":1}'
        signature = generate_signature(payload.decode(), TOKEN).upper()
        assert verify_terraform_signature(payload, signature, TOKEN) is True

    def test_invalid_signature_returns_false(self):
        assert verify_terraform_signature(b"{}", "deadbeef", TOKEN) is False

    def test_missing_signature_returns_false(self):
        assert verify_terraform_signature(b"{}", None, TOKEN) is False

    def test_tampered_payload_returns_false(self):
        signature = generate_signature('{"run_id":"run-1"}', TOKEN)
        assert verify_terraform_signature(b'{"run_id":"run-2"}', signature, TOKEN) is False

    def test_wrong_token_returns_false(self):
        signature = generate_signature("{}", TOKEN)
        assert verify_terraform_signature(b"{}", signature, "wrong") is False

    def test_sha256_signature_returns_false(self):
        sha256 = hmac.new(TOKEN.encode(), b"{}", hashlib.sha256).hexdigest()
        assert verify_terraform_signature(b"{}", sha256, TOKEN) is False


class TestGetTriggers:
    def test_notifications_array(self):
        assert get_triggers(run_payload("run:completed")) == ["run:completed"]

    def test_top_level_trigger(self):
        assert get_triggers(DRIFT_PAYLOAD) == ["assessment:drifted"]

    def test_change_request(self):
        assert get_triggers({"change_request_url": "https://app.terraform.io/x"}) == ["team:change_request"]


class TestWebhookEndpoint:
    def test_accepts_verification_request(self):
        assert post(VERIFICATION_PAYLOAD).status_code == 200

    @pytest.mark.parametrize(
        "trigger",
        ["run:created", "run:planning", "run:needs_attention", "run:applying", "run:completed", "run:errored"],
    )
    def test_accepts_run_notifications(self, trigger):
        assert post(run_payload(trigger)).status_code == 200

    @pytest.mark.parametrize("trigger", ["assessment:drifted", "assessment:check_failure", "assessment:failed"])
    def test_accepts_workspace_notifications(self, trigger):
        assert post({**DRIFT_PAYLOAD, "trigger": trigger}).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        assert post(run_payload("run:completed"), content_type="text/plain").status_code == 200

    def test_invalid_signature_returns_400(self):
        assert post(run_payload("run:completed"), signature="a" * 128).status_code == 400

    def test_missing_signature_returns_400(self):
        assert post(run_payload("run:completed"), signature="").status_code == 400

    def test_signed_non_json_returns_400(self):
        assert post("not json").status_code == 400

    def test_missing_token_returns_500(self, monkeypatch):
        monkeypatch.delenv("TERRAFORM_NOTIFICATION_TOKEN")
        assert post(run_payload("run:completed")).status_code == 500
