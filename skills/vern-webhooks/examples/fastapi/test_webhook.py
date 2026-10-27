import base64
import hashlib
import hmac
import json
import secrets
import time

import pytest
from fastapi.testclient import TestClient

from main import app

# Svix-format secret: 'whsec_' + base64(key); this is base64 of "test_secret_key_for-webhooks"
TEST_SECRET = "whsec_dGVzdF9zZWNyZXRfa2V5X2Zvci13ZWJob29rcw=="

client = TestClient(app)

BATCH = {"id": "batch_a1b2c3d4e5f6", "index": 0, "total": 3, "size": 2, "timestamp": "2026-05-12T12:00:00.000Z"}

# Flat payload (version 1.0), as in Vern's docs
FLAT = {
    "version": "1.0",
    "workbook_id": "wb_abc123",
    "external_id": "your-external-id",
    "batch": BATCH,
    "sheets": [
        {
            "id": "sheet_001",
            "name": "Contacts",
            "row_count": 2,
            "start_row_index": 0,
            "end_row_index": 1,
            "data": [
                {"First Name": "Jane", "Last Name": "Doe", "Email": "jane@example.com", "errors": [], "row_index": 0},
                {"First Name": "John", "Last Name": "Smith", "Email": "john@example.com", "errors": ["Email domain not allowed"], "row_index": 1},
            ],
        }
    ],
}

# Nested payload (version 2.0), as in Vern's docs
NESTED = {
    "version": "2.0",
    "workbook_id": "wb_abc123",
    "company_name": "Acme Corp",
    "external_id": "your-external-id",
    "export_mode": "nested",
    "batch": {**BATCH, "index": 1, "total": 2, "size": 1},
    "root_sheets": ["Departments"],
    "data": {
        "Departments": [
            {
                "Department Name": "Engineering",
                "Location": "San Francisco",
                "errors": [],
                "row_index": 0,
                "children": {
                    "Employees": [{"Name": "Jane Doe", "Role": "Engineer", "Department": "Engineering", "errors": [], "row_index": 0, "children": {}}]
                },
            }
        ]
    },
}
FLAT_BODY = json.dumps(FLAT)


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "svix"):
    """prefix is 'svix' (Vern) or 'webhook' (Standard Webhooks names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/vern",
        content=payload,
        headers={
            "content-type": content_type,
            f"{prefix}-id": msg_id,
            f"{prefix}-timestamp": timestamp,
            f"{prefix}-signature": signature or sign(payload, msg_id, timestamp),
        },
    )


@pytest.fixture(autouse=True)
def setup_env(monkeypatch):
    monkeypatch.setenv("VERN_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


def test_flat_batch():
    response = send(FLAT_BODY)
    assert response.status_code == 200
    assert response.json() == {"success": True, "version": "1.0", "batch_id": BATCH["id"], "batch_index": 0, "last": False, "records": 2}


def test_nested_batch_flags_last():
    response = send(json.dumps(NESTED))
    assert response.status_code == 200
    assert response.json() == {"success": True, "version": "2.0", "batch_id": BATCH["id"], "batch_index": 1, "last": True, "records": 1}


def test_unknown_version_acknowledged():
    response = send(json.dumps({"version": "3.0", "batch": BATCH}))
    assert response.status_code == 200
    assert response.json()["version"] == "3.0"


def test_any_content_type_verifies():
    response = send(FLAT_BODY, content_type="application/octet-stream")
    assert response.status_code == 200


def test_webhook_prefixed_headers_accepted():
    """A delivery signed the same way but sent with webhook-* headers verifies."""
    response = send(FLAT_BODY, prefix="webhook")
    assert response.status_code == 200
    assert response.json() == {"success": True, "version": "1.0", "batch_id": BATCH["id"], "batch_index": 0, "last": False, "records": 2}


def test_webhook_prefixed_invalid_signature():
    response = send(FLAT_BODY, prefix="webhook", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = FLAT_BODY
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/vern", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send(FLAT_BODY, signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send(FLAT_BODY, signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = FLAT_BODY
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign(FLAT_BODY, msg_id, timestamp)
    response = send(FLAT_BODY.replace("wb_abc123", "wb_other"), msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send(FLAT_BODY, timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("VERN_WEBHOOK_SECRET")
    assert send(FLAT_BODY).status_code == 500


def test_signed_body_that_is_not_json():
    response = send("not json")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid JSON"


@pytest.mark.parametrize("body", ["null", "[]", '"text"'])
def test_signed_body_that_is_not_an_object(body):
    assert send(body).status_code == 400
