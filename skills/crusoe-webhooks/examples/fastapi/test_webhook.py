import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix-style secret: 'whsec_' + base64(key). base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

# Documented example body for resource.automated_remediation (node replacement)
REMEDIATION_PAYLOAD = {
    "status": "started",
    "org_name": "Org ABC 123",
    "org_id": "org-abc123",
    "project_name": "ml-training",
    "project_id": "proj-def456",
    "cluster_name": "training-cluster-prod",
    "cluster_id": "cluster-abc123",
    "resource_type": "VM",
    "resource_name": "worker-node-42",
    "resource_id": "vm-xyz789",
    "location": "us-east1-a",
    "workflow_type": "Node Replacement",
    "triggered_by": {"error_name": "XID 79: GPU has fallen off the bus"},
}

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("CRUSOE_WEBHOOK_SECRET", TEST_SECRET)


def sign(payload: str, timestamp: str, msg_id: str, secret: str = TEST_SECRET) -> str:
    """Sign the way Svix does:
    base64(HMAC_SHA256(base64Decode(secret after whsec_), f"{id}.{timestamp}.{body}"))"""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def new_id() -> str:
    return "msg_" + secrets.token_hex(12)


def signed_headers(payload: str, timestamp: str | None = None, msg_id: str | None = None,
                   signature: str | None = None) -> dict:
    timestamp = timestamp or now()
    msg_id = msg_id or new_id()
    return {
        "content-type": "application/json",
        "svix-id": msg_id,
        "svix-timestamp": timestamp,
        "svix-signature": signature or sign(payload, timestamp, msg_id),
    }


def post(payload: str, headers: dict):
    return client.post("/webhooks/crusoe", content=payload, headers=headers)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_documented_remediation_payload():
    payload = json.dumps(REMEDIATION_PAYLOAD)
    response = post(payload, signed_headers(payload))

    assert response.status_code == 200
    assert response.json() == {"received": True, "type": "resource.automated_remediation"}


def test_explicit_type_field():
    payload = json.dumps({"type": "resource.automated_remediation", "status": "completed"})
    response = post(payload, signed_headers(payload))

    assert response.status_code == 200
    assert response.json()["type"] == "resource.automated_remediation"


def test_undocumented_payload_shape():
    payload = json.dumps({"budget_name": "monthly", "threshold_percent": 80})
    response = post(payload, signed_headers(payload))

    assert response.status_code == 200
    assert response.json()["type"] == "unknown"


def test_multiple_signatures():
    """Secret rotation: accept the message if any signature matches."""
    payload = json.dumps(REMEDIATION_PAYLOAD)
    timestamp, msg_id = now(), new_id()
    valid = sign(payload, timestamp, msg_id)
    response = post(
        payload,
        signed_headers(payload, timestamp, msg_id, f"v1,aW52YWxpZA== {valid}"),
    )

    assert response.status_code == 200


def test_missing_headers():
    response = post(json.dumps(REMEDIATION_PAYLOAD), {"content-type": "application/json"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    payload = json.dumps(REMEDIATION_PAYLOAD)
    response = post(payload, signed_headers(payload, signature="v1,aW52YWxpZA=="))

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_wrong_secret():
    payload = json.dumps(REMEDIATION_PAYLOAD)
    timestamp, msg_id = now(), new_id()
    signature = sign(payload, timestamp, msg_id, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    response = post(payload, signed_headers(payload, timestamp, msg_id, signature))

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_tampered_body():
    payload = json.dumps(REMEDIATION_PAYLOAD)
    headers = signed_headers(payload)
    tampered = json.dumps({**REMEDIATION_PAYLOAD, "status": "completed"})
    response = post(tampered, headers)

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    payload = json.dumps(REMEDIATION_PAYLOAD)
    old = str(int(time.time()) - 600)  # 10 minutes ago
    response = post(payload, signed_headers(payload, timestamp=old))

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid timestamp"


def test_non_object_json():
    payload = "[1, 2, 3]"
    response = post(payload, signed_headers(payload))

    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("CRUSOE_WEBHOOK_SECRET")
    payload = json.dumps(REMEDIATION_PAYLOAD)
    response = post(payload, signed_headers(payload))

    assert response.status_code == 500
