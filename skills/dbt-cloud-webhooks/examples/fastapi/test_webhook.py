import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_dbt_cloud_secret"  # dbt's hmac_secret is a raw string
os.environ["DBT_CLOUD_WEBHOOK_SECRET"] = SECRET

from main import app, verify_dbt_cloud_signature  # noqa: E402

client = TestClient(app)


def sign(payload: bytes, secret: str = SECRET) -> str:
    """Real dbt Cloud algorithm: lowercase hex HMAC-SHA256 of the raw body, sent bare in Authorization."""
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def make_payload(event_type: str) -> bytes:
    return json.dumps({
        "accountId": 1,
        "webhookId": "wsu_12345abcde",
        "eventId": "wev_2L6Z3l8uPedXKPq9D2nWbPIip7Z",
        "timestamp": "2023-01-31T19:28:15.742843678Z",
        "eventType": event_type,
        "webhookName": "test",
        "data": {"jobId": "123", "jobName": "Daily Job (dbt build)", "runId": "12345", "runStatus": "Success"},
    }).encode()


def post(payload: bytes, auth: str | None = None):
    headers = {"Content-Type": "application/json"}
    if auth is not None:
        headers["Authorization"] = auth
    return client.post("/webhooks/dbt-cloud", content=payload, headers=headers)


class TestVerify:
    body = b'{"a":1}'

    def test_valid(self):
        assert verify_dbt_cloud_signature(self.body, sign(self.body), SECRET)

    def test_wrong_secret(self):
        assert not verify_dbt_cloud_signature(self.body, sign(self.body, "other"), SECRET)

    def test_tampered_body(self):
        assert not verify_dbt_cloud_signature(b'{"a":2}', sign(self.body), SECRET)

    def test_bearer_prefix_rejected(self):
        assert not verify_dbt_cloud_signature(self.body, f"Bearer {sign(self.body)}", SECRET)

    def test_missing_or_short_header(self):
        assert not verify_dbt_cloud_signature(self.body, None, SECRET)
        assert not verify_dbt_cloud_signature(self.body, "abc", SECRET)


class TestWebhook:
    @pytest.mark.parametrize("event_type", ["job.run.started", "job.run.completed", "job.run.errored"])
    def test_valid_event(self, event_type):
        payload = make_payload(event_type)
        res = post(payload, sign(payload))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_unknown_event_type(self):
        payload = make_payload("job.run.unknown")
        assert post(payload, sign(payload)).status_code == 200

    def test_missing_header(self):
        assert post(make_payload("job.run.completed")).status_code == 400

    def test_invalid_signature(self):
        assert post(make_payload("job.run.completed"), "a" * 64).status_code == 400

    def test_modified_body(self):
        payload = make_payload("job.run.completed")
        assert post(payload.replace(b"Success", b"Errored"), sign(payload)).status_code == 400

    def test_non_json_body(self):
        payload = b"not json"
        assert post(payload, sign(payload)).status_code == 400


def test_health():
    assert client.get("/health").status_code == 200
