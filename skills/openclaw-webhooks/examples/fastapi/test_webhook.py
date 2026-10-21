import json
import os

import pytest
from fastapi.testclient import TestClient

# cron.webhookToken from the Gateway config; OpenClaw sends it as "Bearer <token>"
WEBHOOK_TOKEN = "test-openclaw-webhook-token"
os.environ["OPENCLAW_WEBHOOK_TOKEN"] = WEBHOOK_TOKEN

from main import app, verify_openclaw_webhook  # noqa: E402

client = TestClient(app)

# Finished event, as OpenClaw POSTs it after an automation run
FINISHED_OK = json.dumps({
    "jobId": "job_123",
    "action": "finished",
    "runId": "run_abc",
    "runAtMs": 1767268800000,
    "durationMs": 4200,
    "status": "ok",
    "completionStatus": "succeeded",
    "summary": "Three deploys today, all green.",
    "job": {"id": "job_123", "name": "Deploy digest"},
    "nextRunAtMs": 1767355200000,
})

# Error events omit the summary
FINISHED_ERROR = json.dumps({
    "jobId": "job_123",
    "action": "finished",
    "runId": "run_def",
    "runAtMs": 1767268800000,
    "status": "error",
    "completionStatus": "failed",
    "error": "Provider request timed out",
    "job": {"id": "job_123", "name": "Deploy digest"},
})

# Failure alert sent to delivery.failureDestination in webhook mode
FAILURE_ALERT = json.dumps({
    "jobId": "job_123",
    "jobName": "Deploy digest",
    "message": 'Automation "Deploy digest" failed 2 times in a row.',
    "runAtMs": 1767268800000,
})


def post(body: str, authorization=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if authorization is not None:
        headers["Authorization"] = authorization
    return client.post("/webhooks/openclaw", content=body, headers=headers)


class TestVerify:
    def test_exact_bearer_value(self):
        assert verify_openclaw_webhook(f"Bearer {WEBHOOK_TOKEN}", WEBHOOK_TOKEN)

    def test_wrong_token(self):
        assert not verify_openclaw_webhook("Bearer wrong-token", WEBHOOK_TOKEN)

    def test_bare_token_without_prefix(self):
        assert not verify_openclaw_webhook(WEBHOOK_TOKEN, WEBHOOK_TOKEN)

    def test_whole_value_compared(self):
        assert not verify_openclaw_webhook(f"bearer {WEBHOOK_TOKEN}", WEBHOOK_TOKEN)
        assert not verify_openclaw_webhook(f"Bearer  {WEBHOOK_TOKEN}", WEBHOOK_TOKEN)

    def test_missing_header_or_token(self):
        assert not verify_openclaw_webhook(None, WEBHOOK_TOKEN)
        assert not verify_openclaw_webhook(f"Bearer {WEBHOOK_TOKEN}", "")


class TestEndpoint:
    def test_finished_ok(self):
        res = post(FINISHED_OK, f"Bearer {WEBHOOK_TOKEN}")
        assert res.status_code == 200
        assert res.json() == {"received": True, "kind": "finished"}

    def test_finished_error(self):
        res = post(FINISHED_ERROR, f"Bearer {WEBHOOK_TOKEN}")
        assert res.status_code == 200
        assert res.json()["kind"] == "finished"

    def test_failure_alert(self):
        res = post(FAILURE_ALERT, f"Bearer {WEBHOOK_TOKEN}")
        assert res.status_code == 200
        assert res.json()["kind"] == "failure_alert"

    def test_any_content_type(self):
        assert post(FINISHED_OK, f"Bearer {WEBHOOK_TOKEN}", content_type="text/plain").status_code == 200

    def test_wrong_token(self):
        assert post(FINISHED_OK, "Bearer wrong-token").status_code == 401

    def test_missing_header(self):
        assert post(FINISHED_OK).status_code == 401

    def test_token_without_bearer_prefix(self):
        assert post(FINISHED_OK, WEBHOOK_TOKEN).status_code == 401

    def test_invalid_json(self):
        assert post("not json", f"Bearer {WEBHOOK_TOKEN}").status_code == 400

    def test_token_not_configured(self, monkeypatch):
        monkeypatch.delenv("OPENCLAW_WEBHOOK_TOKEN", raising=False)
        assert post(FINISHED_OK, f"Bearer {WEBHOOK_TOKEN}").status_code == 500


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
