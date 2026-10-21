import hashlib
import hmac
import os

import pytest
from fastapi.testclient import TestClient

SHARED_KEY = "123"  # Maxio uses the Site Shared Key as a raw string
os.environ["MAXIO_SHARED_KEY"] = SHARED_KEY

from main import app  # noqa: E402

client = TestClient(app)
HEADER = "X-Chargify-Webhook-Signature-Hmac-Sha-256"
VECTOR_BODY = "payload[chargify]=testing&event=test"
VECTOR_SIG = "19826d51b9f866b26eda1f154de192593360f8d0bcb63df8a28540a5dcf733f1"


def sign(body: str, key: str = SHARED_KEY) -> str:
    return hmac.new(key.encode(), body.encode(), hashlib.sha256).hexdigest()


def post(body: str, signature=None):
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    if signature is not None:
        headers[HEADER] = signature
    return client.post("/webhooks/maxio", content=body, headers=headers)


def test_matches_documented_test_vector():
    assert sign(VECTOR_BODY) == VECTOR_SIG
    assert post(VECTOR_BODY, VECTOR_SIG).status_code == 200


@pytest.mark.parametrize(
    "event",
    [
        "signup_success",
        "payment_success",
        "payment_failure",
        "renewal_success",
        "subscription_state_change",
    ],
)
def test_accepts_signed_events(event):
    body = f"payload[subscription][id]=42&event={event}"
    res = post(body, sign(body))
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_uppercase_hex_signature():
    assert post(VECTOR_BODY, VECTOR_SIG.upper()).status_code == 200


def test_rejects_invalid_signature():
    assert post(VECTOR_BODY, "a" * 64).status_code == 400


def test_rejects_wrong_length_signature():
    assert post(VECTOR_BODY, "abcd").status_code == 400


def test_rejects_missing_signature():
    assert post(VECTOR_BODY).status_code == 400


def test_rejects_tampered_body():
    assert post("payload[chargify]=evil&event=test", VECTOR_SIG).status_code == 400


def test_rejects_wrong_key():
    assert post(VECTOR_BODY, sign(VECTOR_BODY, "wrong")).status_code == 400
