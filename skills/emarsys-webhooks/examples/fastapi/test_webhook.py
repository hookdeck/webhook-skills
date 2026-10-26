import base64
import json
import os

# Set test environment variables before importing the app
os.environ["EMARSYS_WEBHOOK_USERNAME"] = "emarsys-hook"
os.environ["EMARSYS_WEBHOOK_PASSWORD"] = "p4ss:word/with+colon"

import pytest
from fastapi.testclient import TestClient

from main import app, seen_deduplication_ids, verify_emarsys_request

client = TestClient(app)

USER = os.environ["EMARSYS_WEBHOOK_USERNAME"]
PASS = os.environ["EMARSYS_WEBHOOK_PASSWORD"]


def basic(user=USER, password=PASS) -> str:
    return "Basic " + base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")


# Illustrative payloads: the real body is defined by the Webhook node preset.
def contact_payload(**overrides):
    payload = {
        "email": "jane@example.com",
        "first_name": "Jane",
        "campaign_name": "spring-sale",  # "Additional data" static key-value
        "deduplication_id": "dd-1",
        "ems_program_id": 4242,
        "event_time": "2026-10-25T12:00:00Z",
    }
    payload.update(overrides)
    return payload


def post(authorization=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(contact_payload())
    headers = {"Content-Type": content_type}
    if authorization is not None:
        headers["Authorization"] = authorization
    return client.post("/webhooks/emarsys", content=content, headers=headers)


@pytest.fixture(autouse=True)
def reset_dedup():
    seen_deduplication_ids.clear()


class TestBasicAuth:
    def test_accepts_correct_credentials(self):
        res = post(basic())
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_scheme_is_case_insensitive(self):
        assert post(basic().replace("Basic", "bAsIc")).status_code == 200

    def test_non_ascii_password_does_not_raise(self):
        headers = {"authorization": basic("u", "pässwörd")}
        assert verify_emarsys_request(headers, "u", "pässwörd") is True
        assert verify_emarsys_request(headers, "u", "password") is False

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_username(self):
        assert post(basic("someone-else", PASS)).status_code == 401

    def test_rejects_wrong_password(self):
        assert post(basic(USER, "wrong")).status_code == 401

    def test_rejects_credentials_of_different_lengths(self):
        assert post(basic("x", "y" * 200)).status_code == 401

    def test_rejects_other_scheme(self):
        assert post(f"Bearer {PASS}").status_code == 401

    @pytest.mark.parametrize("junk", ["!!", "AAAA", "=", " extra"])
    def test_rejects_valid_credentials_followed_by_junk(self, junk):
        valid = basic().removeprefix("Basic ")
        assert post(f"Basic {valid}{junk}").status_code == 401

    @pytest.mark.parametrize("value", ["Basic %%%%", "Basic", "Basic YQ", "Basic YR=="])
    def test_rejects_malformed_base64(self, value):
        assert post(value).status_code == 401

    def test_rejects_credentials_without_colon(self):
        header = "Basic " + base64.b64encode(b"nocolon").decode()
        assert post(header).status_code == 401

    def test_rejects_everything_when_unconfigured(self):
        assert verify_emarsys_request({"authorization": basic("", "")}, "", "") is False

    def test_authenticates_before_parsing_body(self):
        assert post(body="not json").status_code == 401


class TestBodyHandling:
    def test_accepts_any_content_type(self):
        assert post(basic(), content_type="text/plain").status_code == 200

    def test_handles_event_data(self):
        body = json.dumps(contact_payload(event_data={"order_id": "A-1", "total": 99.5}))
        assert post(basic(), body).status_code == 200

    def test_handles_missing_deduplication_id(self):
        payload = contact_payload()
        del payload["deduplication_id"]
        res = post(basic(), json.dumps(payload))
        assert res.status_code == 200
        assert "duplicate" not in res.json()

    def test_invalid_json_returns_406(self):
        assert post(basic(), "not json").status_code == 406

    def test_non_object_returns_406(self):
        assert post(basic(), "[1,2]").status_code == 406


class TestIdempotency:
    def test_repeated_deduplication_id_is_acknowledged_once(self):
        first = post(basic())
        second = post(basic())
        assert first.json() == {"received": True}
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}

    def test_different_ids_processed_separately(self):
        post(basic())
        res = post(basic(), json.dumps(contact_payload(deduplication_id="dd-2")))
        assert res.json() == {"received": True}


def test_health():
    assert client.get("/health").status_code == 200
