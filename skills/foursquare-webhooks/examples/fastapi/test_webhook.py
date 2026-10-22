import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "test_pilgrim_secret_abc123"

# Set test environment variables before importing the app
os.environ["FOURSQUARE_PILGRIM_SECRET"] = SECRET

from main import app, verify_pilgrim_secret  # noqa: E402

client = TestClient(app)

ARRIVAL_EVENT = {
    "pilgrimVisitId": "4c4763f7646e38002cc51789",
    "eventType": "placeArrival",
    "timestamp": 1548182419000,
    "placeEvent": {
        "venues": [
            {"id": "52af211911d2aa9d4a1f0e0a", "name": "Foursquare Chicago", "probability": 0.33}
        ],
        "confidence": "high",
        "locationType": "venue",
        "arrivalTime": 1548182419000,
    },
    "lat": 41.889303,
    "lng": -87.628898,
    "installId": "CB25EFFB-C2B2-4E0F-B0E9-55C05BEFA4D4",
    "sdkType": "iossdk",
    "sdkBuild": "2.4.2",
}

GEOFENCE_EVENT = {
    "eventType": "geofenceEnter",
    "timestamp": 1548182419000,
    "geofenceEvent": {"eventType": "geofenceEnter", "radius": 100, "geofenceId": "gf-123"},
    "lat": 41.889303,
    "lng": -87.628898,
    "installId": "CB25EFFB-C2B2-4E0F-B0E9-55C05BEFA4D4",
    "sdkType": "androidsdk",
    "sdkBuild": "2.4.2",
}


@pytest.fixture(autouse=True)
def restore_env():
    os.environ["FOURSQUARE_PILGRIM_SECRET"] = SECRET
    yield
    os.environ["FOURSQUARE_PILGRIM_SECRET"] = SECRET


def post(body, secret=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if secret is not None:
        headers["Pilgrim-Secret"] = secret
    data = body if isinstance(body, str) else json.dumps(body)
    return client.post("/webhooks/foursquare", content=data, headers=headers)


class TestVerifyPilgrimSecret:
    def test_accepts_matching_secret(self):
        assert verify_pilgrim_secret(SECRET, SECRET) is True

    def test_rejects_wrong_secret_including_different_length(self):
        assert verify_pilgrim_secret("wrong", SECRET) is False
        assert verify_pilgrim_secret(SECRET + "extra", SECRET) is False

    def test_rejects_missing_values(self):
        assert verify_pilgrim_secret(None, SECRET) is False
        assert verify_pilgrim_secret(SECRET, None) is False


class TestWebhookEndpoint:
    def test_missing_header_returns_401(self):
        assert post(ARRIVAL_EVENT).status_code == 401

    def test_wrong_secret_returns_401(self):
        assert post(ARRIVAL_EVENT, "wrong").status_code == 401

    def test_valid_secret_returns_200(self):
        response = post(ARRIVAL_EVENT, SECRET)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_verifies_regardless_of_content_type(self):
        assert post(ARRIVAL_EVENT, SECRET, "text/plain").status_code == 200

    def test_unset_secret_fails_closed(self):
        del os.environ["FOURSQUARE_PILGRIM_SECRET"]
        assert post(ARRIVAL_EVENT, SECRET).status_code == 500

    def test_invalid_json_returns_400(self):
        assert post("{not json", SECRET).status_code == 400

    def test_non_object_payload_returns_400(self):
        assert post(["not-an-event"], SECRET).status_code == 400

    def test_handles_visit_geofence_and_journey_events(self):
        events = [
            ARRIVAL_EVENT,
            {**ARRIVAL_EVENT, "eventType": "placeDeparture"},
            {**ARRIVAL_EVENT, "eventType": "placeHistorical"},
            GEOFENCE_EVENT,
            {**GEOFENCE_EVENT, "eventType": "geofenceDwell"},
            {**GEOFENCE_EVENT, "eventType": "geofencePresence"},
            {**GEOFENCE_EVENT, "eventType": "geofenceExit"},
            {"journeyId": "j-1", "eventType": "journeysInProgress"},
            {"journeyId": "j-1", "eventType": "journeysApproaching"},
            {"journeyId": "j-1", "eventType": "journeysArrived"},
            {"journeyId": "j-1", "eventType": "journeysCompleted"},
            {"journeyId": "j-1", "eventType": "journeysCanceled"},
            {"eventType": "some_future_event"},
        ]
        for event in events:
            assert post(event, SECRET).status_code == 200


class TestHealth:
    def test_health(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
