# Generated with: okta-webhooks skill
# https://github.com/hookdeck/webhook-skills

import os

os.environ["OKTA_WEBHOOK_SECRET"] = "test-shared-secret"

from fastapi.testclient import TestClient  # noqa: E402

import main  # noqa: E402

SECRET = "test-shared-secret"
# Keep the module-level secret in sync with the env var set above.
main.OKTA_WEBHOOK_SECRET = SECRET

client = TestClient(main.app)


def sample_payload():
    return {
        "eventType": "com.okta.event_hook",
        "eventTime": "2026-07-02T12:00:00.000Z",
        "eventId": "b5a4-test",
        "data": {
            "events": [
                {
                    "uuid": "d6f5-test",
                    "eventType": "user.session.start",
                    "displayMessage": "User login to Okta",
                    "actor": {"id": "00u1", "type": "User", "alternateId": "jane@example.com"},
                    "target": [
                        {"id": "00u1", "type": "User", "alternateId": "jane@example.com"}
                    ],
                }
            ]
        },
    }


def test_verification_handshake_echoes_challenge():
    challenge = "8T3zabc-challenge-value"
    res = client.get(
        "/webhooks/okta",
        headers={"x-okta-verification-challenge": challenge},
    )
    assert res.status_code == 200
    assert res.json() == {"verification": challenge}


def test_post_accepts_valid_authorization():
    res = client.post(
        "/webhooks/okta",
        headers={"Authorization": SECRET},
        json=sample_payload(),
    )
    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_post_rejects_invalid_authorization():
    res = client.post(
        "/webhooks/okta",
        headers={"Authorization": "wrong-secret"},
        json=sample_payload(),
    )
    assert res.status_code == 401


def test_post_rejects_missing_authorization():
    res = client.post("/webhooks/okta", json=sample_payload())
    assert res.status_code == 401


def test_post_rejects_missing_events():
    res = client.post(
        "/webhooks/okta",
        headers={"Authorization": SECRET},
        json={"eventType": "com.okta.event_hook", "data": {}},
    )
    assert res.status_code == 400
