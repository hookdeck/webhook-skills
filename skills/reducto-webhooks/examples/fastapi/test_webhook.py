import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Test signing secret. Svix secrets are 'whsec_' + base64(key).
# base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="
JOB_ID = "a1b9090e-c9ae-420b-9726-f658afbbe338"

client = TestClient(app)


def generate_signature(payload: str, secret: str, timestamp: str, msg_id: str) -> str:
    """Generate a valid signature the same way Svix does for Reducto."""
    signed_content = f"{msg_id}.{timestamp}.{payload}"
    key = base64.b64decode(secret.split("_")[1])
    signature = base64.b64encode(
        hmac.new(key, signed_content.encode(), hashlib.sha256).digest()
    ).decode()
    return f"v1,{signature}"


def job_payload(status: str) -> str:
    return json.dumps(
        {
            "status": status,
            "job_id": JOB_ID,
            "metadata": {"user_id": "123", "document_type": "invoice"},
        }
    )


def signed_headers(payload: str, timestamp: str | None = None, secret: str = TEST_SECRET) -> dict:
    timestamp = timestamp or str(int(time.time()))
    msg_id = f"msg_{secrets.token_hex(16)}"
    return {
        "content-type": "application/json",
        "svix-id": msg_id,
        "svix-timestamp": timestamp,
        "svix-signature": generate_signature(payload, secret, timestamp, msg_id),
    }


def post(payload: str, headers: dict):
    return client.post("/webhooks/reducto", content=payload, headers=headers)


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("REDUCTO_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_completed_job():
    payload = job_payload("Completed")
    response = post(payload, signed_headers(payload))
    assert response.status_code == 200
    assert response.json() == {"received": True, "status": "Completed", "job_id": JOB_ID}


def test_failed_job():
    payload = job_payload("Failed")
    response = post(payload, signed_headers(payload))
    assert response.status_code == 200
    assert response.json()["status"] == "Failed"


def test_unknown_status_handled_gracefully():
    payload = job_payload("Pending")
    response = post(payload, signed_headers(payload))
    assert response.status_code == 200
    assert response.json()["status"] == "Pending"


def test_multiple_signatures_secret_rotation():
    payload = job_payload("Completed")
    headers = signed_headers(payload)
    headers["svix-signature"] = f"v1,aW52YWxpZF9zaWduYXR1cmU= {headers['svix-signature']}"
    response = post(payload, headers)
    assert response.status_code == 200


def test_missing_headers():
    response = post(job_payload("Completed"), {"content-type": "application/json"})
    assert response.status_code == 400
    assert "Missing required" in response.json()["detail"]


def test_invalid_signature():
    payload = job_payload("Completed")
    headers = signed_headers(payload)
    headers["svix-signature"] = "v1,aW52YWxpZF9zaWduYXR1cmU="
    response = post(payload, headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_tampered_body():
    headers = signed_headers(job_payload("Failed"))
    response = post(job_payload("Completed"), headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_wrong_secret():
    payload = job_payload("Completed")
    wrong_secret = "whsec_" + base64.b64encode(b"wrong_secret_key").decode()
    response = post(payload, signed_headers(payload, secret=wrong_secret))
    assert response.status_code == 400


def test_old_timestamp():
    payload = job_payload("Completed")
    # 10 minutes ago — outside the 5-minute tolerance.
    old = str(int(time.time()) - 600)
    response = post(payload, signed_headers(payload, timestamp=old))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("REDUCTO_WEBHOOK_SECRET")
    payload = job_payload("Completed")
    response = post(payload, signed_headers(payload))
    assert response.status_code == 500
