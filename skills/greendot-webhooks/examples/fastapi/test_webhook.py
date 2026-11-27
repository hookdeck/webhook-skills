import json
import os

# Set env before importing the app so module-level config picks it up.
os.environ["GREENDOT_WEBHOOK_TOKEN_SECRET"] = "test_token_secret_at_least_32_bytes_long"
os.environ["GREENDOT_WEBHOOK_SCOPE"] = "post:webhook"

import jwt
from fastapi.testclient import TestClient

import main

REQUEST_ID = "req-abc-123"
# Trimmed from Green Dot's documented transaction example (Webhook Events page).
PAYLOAD = json.dumps(
    {
        "accounts": [
            {
                "accountIdentifier": "f8e47e10-9ff9-449d-b3bc-d075947c9ff6",
                "events": [
                    {
                        "eventIdentifier": "4c579f23-bbd9-4033-96d9-4605eff580b1",
                        "eventType": "transaction",
                        "eventDateTime": "2026-06-22T03:56:08.370Z",
                    }
                ],
            }
        ]
    }
)


def make_token(scope="post:webhook"):
    return jwt.encode(
        {"scope": scope}, os.environ["GREENDOT_WEBHOOK_TOKEN_SECRET"], algorithm="HS256"
    )


def load_client():
    return TestClient(main.app)


def test_accepts_valid_token_and_echoes_request_id():
    client = load_client()
    res = client.post(
        "/webhooks/greendot",
        headers={
            "Authorization": f"Bearer {make_token()}",
            "x-GD-RequestId": REQUEST_ID,
            "Content-Type": "application/json",
        },
        content=PAYLOAD,
    )
    assert res.status_code == 200
    assert res.headers["x-GD-RequestId"] == REQUEST_ID
    detail = res.json()["responseDetails"][0]
    assert detail == {"code": 0, "subCode": 0, "description": REQUEST_ID}


def test_rejects_missing_token():
    client = load_client()
    res = client.post(
        "/webhooks/greendot",
        headers={"x-GD-RequestId": REQUEST_ID, "Content-Type": "application/json"},
        content=PAYLOAD,
    )
    assert res.status_code == 401


def test_rejects_wrong_secret():
    client = load_client()
    bad = jwt.encode({"scope": "post:webhook"}, "wrong_secret", algorithm="HS256")
    res = client.post(
        "/webhooks/greendot",
        headers={"Authorization": f"Bearer {bad}", "Content-Type": "application/json"},
        content=PAYLOAD,
    )
    assert res.status_code == 401


def test_rejects_missing_scope():
    client = load_client()
    res = client.post(
        "/webhooks/greendot",
        headers={
            "Authorization": f"Bearer {make_token(scope='read:account')}",
            "Content-Type": "application/json",
        },
        content=PAYLOAD,
    )
    assert res.status_code == 401


def test_ignores_unverified_signature_header():
    # x-gd-signature is undocumented and intentionally not verified; the token
    # is the gate, so the header does not affect the outcome.
    client = load_client()
    res = client.post(
        "/webhooks/greendot",
        headers={
            "Authorization": f"Bearer {make_token()}",
            "x-GD-RequestId": REQUEST_ID,
            "x-gd-signature": "anything-here-is-not-checked",
            "Content-Type": "application/json",
        },
        content=PAYLOAD,
    )
    assert res.status_code == 200


def test_rejects_invalid_json_after_auth():
    client = load_client()
    res = client.post(
        "/webhooks/greendot",
        headers={
            "Authorization": f"Bearer {make_token()}",
            "Content-Type": "application/json",
        },
        content="{not json",
    )
    assert res.status_code == 400
