import base64
import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

# Atlas Webhook Secrets are any string you choose; used as a raw string key
SECRET = "test_atlas_webhook_secret"


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("MONGODB_ATLAS_WEBHOOK_SECRET", SECRET)


from main import app, verify_atlas_signature  # noqa: E402

client = TestClient(app)


def sign(body: bytes, secret: str = SECRET) -> str:
    """Sign like Atlas: base64(HMAC-SHA1(secret, raw body))."""
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha1).digest()).decode()


METRIC_ALERT = {
    "id": "5d1b6f8e8c2e4e2d3c4a5b6c",
    "groupId": "5d1b6f8e8c2e4e2d3c4a5b6d",
    "eventTypeName": "OUTSIDE_METRIC_THRESHOLD",
    "status": "OPEN",
    "humanReadable": "Disk space used on data partition is 95.2%. Project: MyProject Organization: MyOrganization",
    "metricName": "DISK_PARTITION_SPACE_USED_DATA",
    "currentValue": {"number": 95.2, "units": "RAW"},
}

HOST_DOWN_ALERT = {
    "id": "5d1b6f8e8c2e4e2d3c4a5b6e",
    "eventTypeName": "HOST_DOWN",
    "status": "CLOSED",
    "humanReadable": "Host is down",
}


def post(body: bytes, signature=None, event="alert.open"):
    headers = {"Content-Type": "application/json", "X-MMS-Event": event}
    if signature:
        headers["X-MMS-Signature"] = signature
    return client.post("/webhooks/mongodb-atlas", content=body, headers=headers)


class TestVerifyAtlasSignature:
    def test_accepts_valid_signature(self):
        body = json.dumps(METRIC_ALERT).encode()
        assert verify_atlas_signature(body, sign(body), SECRET) is True

    def test_digest_is_base64_sha1(self):
        assert len(sign(b"{}")) == 28

    def test_rejects_hex_signature(self):
        body = json.dumps(METRIC_ALERT).encode()
        hex_sig = hmac.new(SECRET.encode(), body, hashlib.sha1).hexdigest()
        assert verify_atlas_signature(body, hex_sig, SECRET) is False

    def test_rejects_sha256_signature(self):
        body = json.dumps(METRIC_ALERT).encode()
        sha256 = base64.b64encode(hmac.new(SECRET.encode(), body, hashlib.sha256).digest()).decode()
        assert verify_atlas_signature(body, sha256, SECRET) is False

    def test_rejects_tampered_body(self):
        body = json.dumps(METRIC_ALERT).encode()
        assert verify_atlas_signature(body.replace(b"95.2", b"1.0"), sign(body), SECRET) is False

    def test_rejects_wrong_secret(self):
        body = json.dumps(METRIC_ALERT).encode()
        assert verify_atlas_signature(body, sign(body, "wrong"), SECRET) is False

    def test_rejects_missing_signature_or_secret(self):
        body = json.dumps(METRIC_ALERT).encode()
        assert verify_atlas_signature(body, None, SECRET) is False
        assert verify_atlas_signature(body, sign(body), None) is False

    def test_rejects_non_ascii_signature(self):
        body = json.dumps(METRIC_ALERT).encode()
        assert verify_atlas_signature(body, "sïg", SECRET) is False


class TestWebhookEndpoint:
    def test_missing_signature_returns_400(self):
        res = post(json.dumps(METRIC_ALERT).encode())
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing X-MMS-Signature header"

    def test_invalid_signature_returns_400(self):
        res = post(json.dumps(METRIC_ALERT).encode(), "AAAAAAAAAAAAAAAAAAAAAAAAAAA=")
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_invalid_json_returns_400(self):
        body = b"not json"
        res = post(body, sign(body))
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid JSON"

    @pytest.mark.parametrize(
        "alert,event",
        [
            (METRIC_ALERT, "alert.open"),
            (HOST_DOWN_ALERT, "alert.close"),
            ({"id": "x", "eventTypeName": "SOMETHING_ELSE", "status": "OPEN"}, "alert.update"),
        ],
    )
    def test_accepts_signed_alert(self, alert, event):
        body = json.dumps(alert).encode()
        res = post(body, sign(body), event)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("MONGODB_ATLAS_WEBHOOK_SECRET")
        body = json.dumps(METRIC_ALERT).encode()
        res = post(body, sign(body))
        assert res.status_code == 500


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
