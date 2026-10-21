import base64
import copy
import json
import os

import pytest

# Credentials YOU choose and enter in the Rubrik webhook's auth settings.
TEST_HEADER_NAME = "X-Rubrik-Webhook-Token"
TEST_SECRET = "rbk_test_9f2c4e6a8b1d3f5e7a9c"
TEST_BEARER = "bearer_test_token_4d6f8a0c2e"
TEST_USERNAME = "rubrik"
TEST_PASSWORD = "pa:ss:word"  # contains colons on purpose

os.environ["RUBRIK_WEBHOOK_HEADER_NAME"] = TEST_HEADER_NAME
os.environ["RUBRIK_WEBHOOK_SECRET"] = TEST_SECRET
os.environ["RUBRIK_WEBHOOK_BEARER_TOKEN"] = TEST_BEARER
os.environ["RUBRIK_WEBHOOK_USERNAME"] = TEST_USERNAME
os.environ["RUBRIK_WEBHOOK_PASSWORD"] = TEST_PASSWORD

from fastapi.testclient import TestClient  # noqa: E402

from main import app, authenticate_request, normalize_event  # noqa: E402

client = TestClient(app)

# Default payload (PD-CEF) from Rubrik's "Events" developer docs.
BACKUP_FAILED = {
    "summary": "Failed backup of vSphere VM 'sh1-EncryptMe-05-Group1'.",
    "source": "Rubrik Security Cloud",
    "severity": "critical",
    "timestamp": "2024-07-18T06:39:40.46Z",
    "class": "Backup",
    "custom_details": {
        "seriesId": "ccd7a8a5-4c58-4c88-bff9-7bdffddb6099",
        "id": "c2b47274-6323-4025-b307-afed1cfb7574",
        "type": "Event",
        "objectId": "83c4a80a-4a57-5699-b399-651089135586",
        "objectName": "sh1-EncryptMe-05-Group1",
        "objectType": "VmwareVm",
        "status": "Failure",
        "clusterId": "6a271636-9392-4cba-90c5-bdbe227854ab",
        "clusterName": "sh1-PaloAlto",
        "eventName": "Snapshot.BackupFailed",
        "errorId": "Snapshot.VmwareSnapshotError",
        "location": "sh1-paloalto-vcsa.rubrikdemo.com",
        "customerID": "rubrik-gaia",
    },
}

BACKUP_SUCCEEDED = copy.deepcopy(BACKUP_FAILED)
BACKUP_SUCCEEDED["summary"] = "Completed backup of vSphere VM 'sh1-EncryptMe-05-Group1'."
BACKUP_SUCCEEDED["severity"] = "info"
BACKUP_SUCCEEDED["custom_details"].update(id="d3c58385-7434-4136-a418-bfe02d0c8685", status="Success")

AUTH = {TEST_HEADER_NAME: TEST_SECRET}


def post(body, headers=None):
    data = body if isinstance(body, str) else json.dumps(body)
    return client.post(
        "/webhooks/rubrik",
        content=data,
        headers={"Content-Type": "application/json", **(headers or {})},
    )


def basic(user, password):
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


class TestCustomHeader:
    def test_accepts_configured_header(self):
        res = post(BACKUP_FAILED, AUTH)
        assert res.status_code == 200
        assert res.json() == {"received": True, "id": "c2b47274-6323-4025-b307-afed1cfb7574"}

    def test_header_name_case_insensitive(self):
        assert post(BACKUP_FAILED, {"x-rubrik-webhook-token": TEST_SECRET}).status_code == 200

    def test_rejects_wrong_value(self):
        assert post(BACKUP_FAILED, {TEST_HEADER_NAME: "wrong"}).status_code == 401

    def test_rejects_missing_header(self):
        assert post(BACKUP_FAILED).status_code == 401

    def test_authorization_as_custom_header_key(self):
        env = {"RUBRIK_WEBHOOK_HEADER_NAME": "Authorization", "RUBRIK_WEBHOOK_SECRET": "Bearer Example123"}
        assert authenticate_request({"authorization": "Bearer Example123"}, env) == "custom_header"
        assert authenticate_request({"authorization": "Bearer nope"}, env) is None


class TestBearer:
    def test_accepts_valid_token(self):
        assert post(BACKUP_FAILED, {"Authorization": f"Bearer {TEST_BEARER}"}).status_code == 200

    def test_scheme_case_insensitive(self):
        assert post(BACKUP_FAILED, {"Authorization": f"bearer {TEST_BEARER}"}).status_code == 200

    def test_rejects_wrong_token(self):
        assert post(BACKUP_FAILED, {"Authorization": "Bearer wrong"}).status_code == 401

    def test_rejects_token_without_scheme(self):
        assert post(BACKUP_FAILED, {"Authorization": TEST_BEARER}).status_code == 401


class TestBasic:
    def test_accepts_valid_credentials(self):
        assert post(BACKUP_FAILED, {"Authorization": basic(TEST_USERNAME, TEST_PASSWORD)}).status_code == 200

    def test_rejects_wrong_password(self):
        assert post(BACKUP_FAILED, {"Authorization": basic(TEST_USERNAME, "nope")}).status_code == 401

    def test_rejects_wrong_username(self):
        assert post(BACKUP_FAILED, {"Authorization": basic("admin", TEST_PASSWORD)}).status_code == 401

    def test_rejects_malformed_base64(self):
        assert post(BACKUP_FAILED, {"Authorization": "Basic !!!notbase64"}).status_code == 401


def test_fail_closed_without_configuration():
    headers = {TEST_HEADER_NAME: TEST_SECRET, "authorization": f"Bearer {TEST_BEARER}"}
    assert authenticate_request(headers, {}) is None


class TestPayload:
    def test_backup_failure(self, capsys):
        assert post(BACKUP_FAILED, AUTH).status_code == 200
        assert "FAILED Backup on sh1-EncryptMe-05-Group1" in capsys.readouterr().out

    def test_backup_success(self, capsys):
        assert post(BACKUP_SUCCEEDED, AUTH).status_code == 200
        assert "Succeeded Backup on sh1-EncryptMe-05-Group1" in capsys.readouterr().out

    def test_anomaly_flagged(self, capsys):
        anomaly = copy.deepcopy(BACKUP_FAILED)
        anomaly["class"] = "Anomaly"
        anomaly["custom_details"]["status"] = "Warning"
        assert post(anomaly, AUTH).status_code == 200
        assert "ANOMALY detected" in capsys.readouterr().out

    def test_flat_custom_template(self):
        custom = {"id": "abc", "type": "Event", "class": "Backup", "status": "Success", "objectName": "db01", "message": "ok"}
        res = post(custom, AUTH)
        assert res.status_code == 200
        assert res.json()["id"] == "abc"

    def test_normalize_pd_cef(self):
        event = normalize_event(BACKUP_FAILED)
        assert event["id"] == "c2b47274-6323-4025-b307-afed1cfb7574"
        assert event["activity_type"] == "Event"
        assert event["event_class"] == "Backup"
        assert event["status"] == "Failure"
        assert event["severity"] == "critical"
        assert event["event_name"] == "Snapshot.BackupFailed"

    def test_invalid_json(self):
        assert post("{not json", AUTH).status_code == 400

    def test_json_array_rejected(self):
        assert post([BACKUP_FAILED], AUTH).status_code == 400

    def test_auth_checked_before_body(self):
        assert post("{not json").status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
