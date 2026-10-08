import os
import json
import time

import jwt  # PyJWT
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

# Generate an RSA keypair to stand in for Wix's signing key. The PUBLIC key goes
# to the app (via env) for verification; the PRIVATE key signs test webhooks.
_private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
PRIVATE_PEM = _private_key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption(),
).decode()
PUBLIC_PEM = (
    _private_key.public_key()
    .public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    .decode()
)

# Set env before importing the app (it reads WIX_PUBLIC_KEY at import time).
os.environ["WIX_APP_ID"] = "test-app-id"
os.environ["WIX_PUBLIC_KEY"] = PUBLIC_PEM

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)

_counter = 0


def _next_id() -> str:
    global _counter
    _counter += 1
    return f"evt-{int(time.time())}-{_counter}"


def create_wix_webhook(
    event_type: str,
    event_id: str,
    *,
    instance_id: str = "inst-1",
    entity_id: str = "order-1",
    slug: str = "created",
    key: str = PRIVATE_PEM,
) -> str:
    """Build a Wix-style webhook JWT.

    The whole body is a JWT whose `data` claim is a JSON string holding
    { eventType, instanceId, data }, where the inner `data` is itself a JSON
    string with the event payload. Signed RS256 — exactly how Wix signs.
    """
    now = int(time.time())
    inner_payload = {
        "id": event_id,
        "entityFqdn": "wix.ecom.v1.order",
        "slug": slug,
        "entityId": entity_id,
        "eventTime": "2026-07-22T10:00:00.000Z",
        "createdEvent": {"entity": {"id": entity_id, "number": "10001"}},
    }
    envelope = {
        "instanceId": instance_id,
        "eventType": event_type,
        "data": json.dumps(inner_payload),
    }
    jwt_payload = {"data": json.dumps(envelope), "iat": now, "exp": now + 300}
    return jwt.encode(jwt_payload, key, algorithm="RS256")


def post(token: str):
    return client.post(
        "/webhooks/wix",
        content=token,
        headers={"Content-Type": "text/plain"},
    )


def test_missing_body_returns_400():
    response = client.post("/webhooks/wix", content="")
    assert response.status_code == 400


def test_invalid_signature_returns_400():
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_pem = other_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    token = create_wix_webhook("wix.ecom.v1.order_created", _next_id(), key=other_pem)

    response = post(token)
    assert response.status_code == 400


def test_malformed_body_returns_400():
    response = post("not-a-jwt")
    assert response.status_code == 400


def test_valid_order_created_returns_200():
    token = create_wix_webhook("wix.ecom.v1.order_created", _next_id())
    response = post(token)
    assert response.status_code == 200
    assert response.text == "OK"


def test_handles_all_order_event_types():
    events = [
        ("wix.ecom.v1.order_created", "created"),
        ("wix.ecom.v1.order_approved", "approved"),
        ("wix.ecom.v1.order_updated", "updated"),
        ("wix.ecom.v1.order_canceled", "canceled"),
    ]
    for event_type, slug in events:
        token = create_wix_webhook(event_type, _next_id(), slug=slug)
        response = post(token)
        assert response.status_code == 200


def test_deduplicates_repeated_event_ids():
    event_id = _next_id()
    token = create_wix_webhook("wix.ecom.v1.order_created", event_id)

    first = post(token)
    second = post(token)

    assert first.status_code == 200
    assert second.status_code == 200  # duplicate acknowledged, not reprocessed


def test_verify_and_decode_unwraps_nested_envelope():
    from main import verify_and_decode

    token = create_wix_webhook("wix.ecom.v1.order_canceled", "evt-decode-1", slug="canceled")
    event = verify_and_decode(token.encode(), PUBLIC_PEM)

    assert event["eventType"] == "wix.ecom.v1.order_canceled"
    assert event["instanceId"] == "inst-1"
    assert event["entity"]["id"] == "evt-decode-1"


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
