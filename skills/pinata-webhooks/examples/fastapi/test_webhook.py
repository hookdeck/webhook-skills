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

# Bodies follow Pinata's event catalog (https://event-types.pinata.cloud/). The two CAR-import events name
# the event `event` instead of `event_type`.
EVENTS = {
    "ipfs.private.file_added": {"event_type": "ipfs.private.file_added", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mime_type": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}}},
    "ipfs.private.file_updated": {"event_type": "ipfs.private.file_updated", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mime_type": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}, "previous_attributes": {"name": "old-pinata.png"}}},
    "ipfs.private.file_deleted": {"event_type": "ipfs.private.file_deleted", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mime_type": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}}},
    "ipfs.public.file_added": {"event_type": "ipfs.public.file_added", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mime_type": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}, "source": "direct_upload"}},
    "ipfs.public.file_updated": {"event_type": "ipfs.public.file_updated", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mime_type": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}, "previous_attributes": {"name": "old-pinata.png"}}},
    "ipfs.public.file_deleted": {"event_type": "ipfs.public.file_deleted", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mime_type": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}}},
    "ipfs.public.car_import_succeeded": {"event": "ipfs.public.car_import_succeeded", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mimetype": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}}},
    "ipfs.public.car_import_failed": {"event": "ipfs.public.car_import_failed", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"error": "invalid CAR", "file_id": "11111111-1111-1111-1111-111111111111"}},
    "ipfs.public.pin_by_cid_added": {"event_type": "ipfs.public.pin_by_cid_added", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "date_queued": "2025-02-05T17:15:20.839Z", "group_id": "11111111-1111-1111-1111-111111111111", "host_nodes": ["/ip4/123.456.78.90/tcp/4001/ipfs/QmAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQr"], "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "name": "my awesome file", "status": "prechecking"}}},
    "ipfs.public.pin_by_cid_succeeded": {"event_type": "ipfs.public.pin_by_cid_succeeded", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"new_file": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "created_at": "2025-01-07T20:13:39.536Z", "group_id": "11111111-1111-1111-1111-111111111111", "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "mime_type": "image/png", "name": "pinata.png", "number_of_files": 1, "size": 42}, "object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "date_queued": "2025-02-05T17:15:20.839Z", "group_id": "11111111-1111-1111-1111-111111111111", "host_nodes": ["/ip4/123.456.78.90/tcp/4001/ipfs/QmAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQr"], "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "name": "my awesome file", "status": "prechecking"}}},
    "ipfs.public.pin_by_cid_failed": {"event_type": "ipfs.public.pin_by_cid_failed", "timestamp": "2025-02-05T20:10:54.111334Z", "workspace_id": "22222222-2222-2222-2222-222222222222", "data": {"object": {"cid": "bafybeifhh5a2o4ilxviboof4c75kkv62hkljpdq3fo3uowkhdrgjr67kbm", "date_queued": "2025-02-05T17:15:20.839Z", "group_id": "11111111-1111-1111-1111-111111111111", "host_nodes": ["/ip4/123.456.78.90/tcp/4001/ipfs/QmAbCdEfGhIjKlMnOpQrStUvWxYzAbCdEfGhIjKlMnOpQr"], "id": "11111111-1111-1111-1111-111111111111", "keyvalues": {"key": "value"}, "name": "my awesome file", "status": "expired"}}},
}


def sign(payload: str, msg_id: str, timestamp: str, secret: str = TEST_SECRET) -> str:
    """Svix algorithm: base64(HMAC-SHA256(decoded secret, "{id}.{timestamp}.{body}"))."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{payload}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> str:
    return str(int(time.time()))


def send(payload: str, msg_id: str = None, timestamp: str = None, signature: str = None,
         content_type: str = "application/json", prefix: str = "webhook"):
    """prefix is 'webhook' (Standard Webhooks names, what Pinata sends) or 'svix' (Svix names for the same values)."""
    msg_id = msg_id or "msg_" + secrets.token_hex(12)
    timestamp = timestamp or now()
    return client.post(
        "/webhooks/pinata",
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
    monkeypatch.setenv("PINATA_WEBHOOK_SECRET", TEST_SECRET)


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}


@pytest.mark.parametrize("event_type,body", list(EVENTS.items()))
def test_handles_events(event_type, body):
    response = send(json.dumps(body))
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": event_type}


def test_unknown_event_type():
    response = send(json.dumps({"event_type": "ipfs.public.something_new"}))
    assert response.status_code == 200
    assert response.json()["type"] == "ipfs.public.something_new"


def test_any_content_type_verifies():
    response = send(json.dumps(EVENTS["ipfs.public.file_added"]), content_type="application/octet-stream")
    assert response.status_code == 200


def test_svix_prefixed_headers_accepted():
    """A delivery signed the same way but sent with svix-* headers verifies."""
    response = send(json.dumps(EVENTS["ipfs.public.file_added"]), prefix="svix")
    assert response.status_code == 200
    assert response.json() == {"success": True, "type": "ipfs.public.file_added"}


def test_svix_prefixed_invalid_signature():
    response = send('{"event_type":"ipfs.public.file_added"}', prefix="svix", signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_multiple_signatures():
    """Secret rotation: any matching v1, entry passes."""
    payload = json.dumps({"event_type": "ipfs.public.file_added"})
    msg_id, timestamp = "msg_rotation", now()
    signature = f"v1,aW52YWxpZF9zaWduYXR1cmU= {sign(payload, msg_id, timestamp)}"
    assert send(payload, msg_id, timestamp, signature).status_code == 200


def test_missing_headers():
    response = client.post("/webhooks/pinata", content="{}", headers={"content-type": "application/json"})
    assert response.status_code == 400
    assert response.json()["detail"] == "Missing required webhook headers"


def test_invalid_signature():
    response = send('{"event_type":"ipfs.public.file_added"}', signature="v1,aW52YWxpZF9zaWduYXR1cmU=")
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_malformed_signature_entry():
    response = send('{"event_type":"ipfs.public.file_added"}', signature="v1,!!!not-base64!!!")
    assert response.status_code == 400


def test_wrong_secret():
    payload = '{"event_type":"ipfs.public.file_added"}'
    msg_id, timestamp = "msg_other", now()
    signature = sign(payload, msg_id, timestamp, "whsec_b3RoZXJfc2VjcmV0X2tleQ==")
    assert send(payload, msg_id, timestamp, signature).status_code == 400


def test_tampered_body():
    msg_id, timestamp = "msg_tamper", now()
    signature = sign('{"event_type":"ipfs.public.file_deleted"}', msg_id, timestamp)
    response = send('{"event_type":"ipfs.public.file_added"}', msg_id, timestamp, signature)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid signature"


def test_old_timestamp():
    response = send('{"event_type":"ipfs.public.file_added"}', timestamp=str(int(time.time()) - 600))
    assert response.status_code == 400
    assert response.json()["detail"] == "Timestamp too old"


def test_missing_secret(monkeypatch):
    monkeypatch.delenv("PINATA_WEBHOOK_SECRET")
    assert send('{"event_type":"ipfs.public.file_added"}').status_code == 500
