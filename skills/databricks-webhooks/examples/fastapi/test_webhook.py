import base64
import os

import pytest
from fastapi.testclient import TestClient

USER = "dbx_user"
PASS = "test_pass:with:colons"

# Set test environment variables before importing the app
os.environ["DATABRICKS_WEBHOOK_USERNAME"] = USER
os.environ["DATABRICKS_WEBHOOK_PASSWORD"] = PASS

from main import app, verify_databricks_auth  # noqa: E402

client = TestClient(app)


def basic_auth(username: str, password: str) -> str:
    """Databricks sends the destination's username/password as a standard Basic auth header."""
    token = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("utf-8")
    return f"Basic {token}"


def job_event(event_type: str) -> dict:
    return {
        "event_type": event_type,
        "workspace_id": "1234567890",
        "run": {"run_id": "42"},
        "job": {"job_id": "7", "name": "nightly-etl"},
    }


ALERT_EVENT = {
    "event": "alert_state_change",
    "url_base": "https://example.cloud.databricks.com/sql?o=1234567890123456",
    "alert": {
        "title": 'Alert "Daily revenue" changed status to TRIGGERED',
        "alert": {
            "id": "9876543210987654",
            "name": "Daily revenue",
            "evaluations": [{"state": "TRIGGERED"}],
        },
    },
}


@pytest.fixture(autouse=True)
def restore_env():
    os.environ["DATABRICKS_WEBHOOK_USERNAME"] = USER
    os.environ["DATABRICKS_WEBHOOK_PASSWORD"] = PASS
    yield


class TestVerifyDatabricksAuth:
    def test_accepts_valid_basic_credentials(self):
        assert verify_databricks_auth(basic_auth(USER, PASS), USER, PASS) is True

    def test_rejects_wrong_password(self):
        assert verify_databricks_auth(basic_auth(USER, "nope"), USER, PASS) is False

    def test_rejects_wrong_username(self):
        assert verify_databricks_auth(basic_auth("someone", PASS), USER, PASS) is False

    def test_rejects_missing_header(self):
        assert verify_databricks_auth(None, USER, PASS) is False

    def test_rejects_non_basic_scheme(self):
        assert verify_databricks_auth("Bearer abc", USER, PASS) is False

    def test_rejects_invalid_base64(self):
        assert verify_databricks_auth("Basic !!!not-base64!!!", USER, PASS) is False

    def test_rejects_decoded_credentials_without_colon(self):
        header = "Basic " + base64.b64encode(b"nocolon").decode()
        assert verify_databricks_auth(header, USER, PASS) is False

    def test_rejects_when_credentials_not_configured(self):
        assert verify_databricks_auth(basic_auth("", ""), "", "") is False


class TestWebhookEndpoint:
    def test_returns_401_when_header_missing(self):
        response = client.post("/webhooks/databricks", json=job_event("jobs.on_success"))
        assert response.status_code == 401

    def test_returns_401_for_invalid_credentials(self):
        response = client.post(
            "/webhooks/databricks",
            json=job_event("jobs.on_success"),
            headers={"Authorization": basic_auth(USER, "wrong")},
        )
        assert response.status_code == 401

    def test_returns_200_for_valid_credentials(self):
        response = client.post(
            "/webhooks/databricks",
            json=job_event("jobs.on_success"),
            headers={"Authorization": basic_auth(USER, PASS)},
        )
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_returns_500_when_credentials_not_configured(self):
        del os.environ["DATABRICKS_WEBHOOK_USERNAME"]
        del os.environ["DATABRICKS_WEBHOOK_PASSWORD"]
        response = client.post(
            "/webhooks/databricks",
            json=job_event("jobs.on_success"),
            headers={"Authorization": basic_auth(USER, PASS)},
        )
        assert response.status_code == 500

    def test_returns_4xx_for_invalid_json(self):
        response = client.post(
            "/webhooks/databricks",
            content="{not json",
            headers={"Authorization": basic_auth(USER, PASS), "Content-Type": "application/json"},
        )
        assert response.status_code in (400, 422)

    @pytest.mark.parametrize(
        "event_type",
        [
            "jobs.on_start",
            "jobs.on_success",
            "jobs.on_failure",
            "jobs.on_duration_warning_threshold_exceeded",
            "jobs.some_future_event",
        ],
    )
    def test_handles_job_event_types(self, event_type):
        response = client.post(
            "/webhooks/databricks",
            json=job_event(event_type),
            headers={"Authorization": basic_auth(USER, PASS)},
        )
        assert response.status_code == 200

    def test_handles_task_level_event(self):
        body = job_event("jobs.on_start")
        body["task"] = {"task_key": "ingest"}
        body["run"] = {"run_id": "43", "parent_run_id": "42"}
        response = client.post(
            "/webhooks/databricks",
            json=body,
            headers={"Authorization": basic_auth(USER, PASS)},
        )
        assert response.status_code == 200

    def test_handles_sql_alert_payload(self):
        response = client.post(
            "/webhooks/databricks",
            json=ALERT_EVENT,
            headers={"Authorization": basic_auth(USER, PASS)},
        )
        assert response.status_code == 200


class TestHealth:
    def test_health(self):
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
