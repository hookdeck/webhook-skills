import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Mercury's secretKey is an opaque string used as-is; this one is only for tests
SECRET = "test_mercury_secret_key_8f3a1c"
os.environ["MERCURY_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)


def sign(body: str, timestamp=None, secret=SECRET) -> str:
    ts = int(time.time()) if timestamp is None else timestamp
    v1 = hmac.new(secret.encode(), f"{ts}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={ts},v1={v1}"


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers["Mercury-Signature"] = signature
    return client.post("/webhooks/mercury", content=body, headers=headers)


TX_UPDATE = json.dumps({
    "id": "bfa85eaa-afab-11f0-8fea-17d650f2306e",
    "resourceType": "transaction",
    "resourceId": "1d3042b6-af63-11f0-89d2-3503f2fcfef7",
    "operationType": "update",
    "resourceVersion": 2,
    "occurredAt": "2025-01-01T00:00:00.000000Z",
    "changedPaths": ["status", "postedAt"],
    "mergePatch": {"postedAt": "2025-01-01T00:00:00.000000+00:00", "status": "sent"},
    "previousValues": {"postedAt": None, "status": "pending"},
})


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(TX_UPDATE, sign(TX_UPDATE))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        assert post(TX_UPDATE, sign(TX_UPDATE), "text/plain").status_code == 200

    def test_rejects_missing_header(self):
        assert post(TX_UPDATE).status_code == 400

    def test_rejects_tampered_body(self):
        assert post(TX_UPDATE.replace("sent", "failed"), sign(TX_UPDATE)).status_code == 400

    def test_rejects_wrong_secret(self):
        assert post(TX_UPDATE, sign(TX_UPDATE, secret="other_secret")).status_code == 400

    def test_rejects_signature_of_different_length(self):
        assert post(TX_UPDATE, "t=1700000000,v1=abc").status_code == 400

    def test_rejects_malformed_header(self):
        assert post(TX_UPDATE, "garbage").status_code == 400
        assert post(TX_UPDATE, "t=abc,v1=deadbeef").status_code == 400

    def test_rejects_altered_timestamp(self):
        header = sign(TX_UPDATE, 1700000000).replace("t=1700000000", "t=1700000001")
        assert post(TX_UPDATE, header).status_code == 400

    def test_accepts_old_timestamp_by_default(self):
        # Retries and replays (including Hookdeck's) keep the original timestamp
        old = int(time.time()) - 3600
        assert post(TX_UPDATE, sign(TX_UPDATE, old)).status_code == 200

    def test_rejects_old_timestamp_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("MERCURY_TIMESTAMP_TOLERANCE_SECONDS", "300")
        old = int(time.time()) - 3600
        assert post(TX_UPDATE, sign(TX_UPDATE, old)).status_code == 400
        assert post(TX_UPDATE, sign(TX_UPDATE)).status_code == 200

    def test_non_numeric_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("MERCURY_TIMESTAMP_TOLERANCE_SECONDS", "five minutes")
        old = int(time.time()) - 3600
        assert post(TX_UPDATE, sign(TX_UPDATE, old)).status_code == 200


class TestEvents:
    @pytest.mark.parametrize("resource_type,operation_type", [
        ("transaction", "create"),
        ("transaction", "update"),
        ("checkingAccount", "update"),
        ("savingsAccount", "update"),
        ("treasuryAccount", "update"),
        ("creditAccount", "update"),
        ("investmentAccount", "update"),
        ("transaction", "delete"),
    ])
    def test_dispatch(self, caplog, resource_type, operation_type):
        body = json.dumps({
            "id": "e1", "resourceType": resource_type, "resourceId": "r1",
            "operationType": operation_type, "changedPaths": ["status"],
            "mergePatch": {"status": "pending"},
        })
        with caplog.at_level(logging.INFO, logger="mercury-webhooks"):
            res = post(body, sign(body))
        assert res.status_code == 200
        if operation_type == "delete":
            assert f"Unhandled event: {resource_type}.delete" in caplog.text
        else:
            assert "Unhandled" not in caplog.text

    def test_rejects_verified_but_invalid_json(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400
