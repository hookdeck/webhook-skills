import os

# Set test environment variables before importing app
os.environ["AUTH0_EVENT_STREAM_TOKEN"] = "test_event_stream_token"

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)

AUTH = f"Bearer {os.environ['AUTH0_EVENT_STREAM_TOKEN']}"


def sample_event(event_type="user.created"):
    """Shape of the user.created example in Auth0's Event Catalog."""
    return {
        "specversion": "1.0",
        "type": event_type,
        "source": "urn:auth0:example.auth0app.com",
        "id": "evt_vjFVP5pVdfvsfRKatshkVV",
        "time": "2025-02-01T12:34:56Z",
        "data": {
            "object": {
                "user_id": "auth0|507f1f77bcf86cd799439020",
                "email": "user1@example.com",
                "created_at": "2025-02-01T12:34:56Z",
                "updated_at": "2025-02-01T12:34:56Z",
            }
        },
        "a0tenant": "my-tenant",
        "a0stream": "est_vjFVP5pVdfvsfRKatshkVV",
    }


def test_missing_authorization_header():
    response = client.post("/webhooks/auth0", json=sample_event())
    assert response.status_code == 401


def test_wrong_token():
    response = client.post(
        "/webhooks/auth0",
        json=sample_event(),
        headers={"Authorization": "Bearer wrong_token_value_here"},
    )
    assert response.status_code == 401


def test_token_without_bearer_prefix():
    response = client.post(
        "/webhooks/auth0",
        json=sample_event(),
        headers={"Authorization": os.environ["AUTH0_EVENT_STREAM_TOKEN"]},
    )
    assert response.status_code == 401


def test_valid_authorization_header():
    response = client.post("/webhooks/auth0", json=sample_event(), headers={"Authorization": AUTH})
    assert response.status_code == 204


def test_other_event_types():
    for event_type in ["user.updated", "user.deleted", "organization.member.added", "group.created"]:
        response = client.post(
            "/webhooks/auth0", json=sample_event(event_type), headers={"Authorization": AUTH}
        )
        assert response.status_code == 204


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
