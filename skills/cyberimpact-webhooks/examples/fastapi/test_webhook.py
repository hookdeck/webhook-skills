import json
import os

# Set test environment variables before importing the app
os.environ["CYBERIMPACT_WEBHOOK_HEADER"] = "Authorization"
os.environ["CYBERIMPACT_WEBHOOK_SECRET"] = "Bearer test_cyberimpact_secret_0123456789"

from fastapi.testclient import TestClient

from main import app, verify_cyberimpact_request

client = TestClient(app)

HEADER = "Authorization"
SECRET = os.environ["CYBERIMPACT_WEBHOOK_SECRET"]


def sample_payload(event="automation.webhook.send"):
    return {
        "id": "test_evt_GppedVq2CWTWxUUxrm26bic0C",
        "event": event,
        "timestamp": "2024-05-28T12:56:40Z",
        "idClient": 3,
        "data": {"type": "member", "id": 54321, "email": "john.doe@example.org",
                 "firstname": "John", "lastname": "Doe"},
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/cyberimpact",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCredentialVerification:
    def test_exact_whole_value_including_bearer_prefix(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_bearer_prefix_is_not_stripped(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_in_other_header(self):
        assert post({"X-Other": SECRET}).status_code == 401

    def test_non_ascii_value_is_rejected_not_error(self):
        # Header values are latin-1 on the wire; compare_digest must never see a str.
        res = client.post(
            "/webhooks/cyberimpact",
            content=json.dumps(sample_payload()),
            headers={HEADER.lower().encode(): "café".encode("latin-1")},
        )
        assert res.status_code == 401

    def test_custom_header_name(self):
        assert verify_cyberimpact_request({"xsecret": "s3cret"}, name="XSecret", secret="s3cret") is True
        assert verify_cyberimpact_request({"authorization": "s3cret"}, name="XSecret", secret="s3cret") is False

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_cyberimpact_request({"authorization": SECRET}, secret="") is False
        assert verify_cyberimpact_request({"authorization": SECRET}, secret=SECRET) is True


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_credential_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    def test_handles_automation_webhook_send(self, capsys):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        out = capsys.readouterr().out
        assert "54321" in out
        assert "Unhandled" not in out

    def test_unknown_event_is_acknowledged(self):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("something.new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
