import base64
import json
import os

# Set test environment variables before importing the app
os.environ["DATOCMS_WEBHOOK_USERNAME"] = "datocms-user"
os.environ["DATOCMS_WEBHOOK_PASSWORD"] = "p@ss:word:with:colons-0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_datocms_request

client = TestClient(app)

USER = os.environ["DATOCMS_WEBHOOK_USERNAME"]
PASS = os.environ["DATOCMS_WEBHOOK_PASSWORD"]


def basic(user, password, scheme="Basic"):
    token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
    return f"{scheme} {token}"


GOOD = basic(USER, PASS)

EVENTS = [
    ("item", "create"), ("item", "update"), ("item", "delete"), ("item", "publish"),
    ("item", "unpublish"), ("item_type", "create"), ("item_type", "update"),
    ("item_type", "delete"), ("upload", "create"), ("upload", "update"), ("upload", "delete"),
    ("build_trigger", "deploy_started"), ("build_trigger", "deploy_succeeded"),
    ("build_trigger", "deploy_failed"), ("environment", "deploy_started"),
    ("environment", "deploy_succeeded"), ("environment", "deploy_failed"),
    ("maintenance_mode", "change"), ("sso_user", "create"), ("cda_cache_tags", "invalidate"),
]


def sample_payload(entity_type="item", event_type="publish"):
    return {
        "environment": "main",
        "entity_type": entity_type,
        "event_type": event_type,
        "entity": {"id": "39830648", "type": entity_type, "attributes": {"name": "Mark Smith"}},
        "related_entities": [],
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/datocms",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestBasicAuthentication:
    def test_correct_credentials(self):
        res = post({"Authorization": GOOD})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_scheme_is_case_insensitive(self):
        assert post({"Authorization": basic(USER, PASS, "basic")}).status_code == 200

    def test_password_with_colons(self):
        assert ":" in PASS
        assert post({"Authorization": GOOD}).status_code == 200

    def test_wrong_username(self):
        assert post({"Authorization": basic("someone-else", PASS)}).status_code == 401

    def test_wrong_password_same_length(self):
        assert post({"Authorization": basic(USER, "x" * len(PASS))}).status_code == 401

    def test_different_length_credentials(self):
        assert post({"Authorization": basic("u", "p")}).status_code == 401

    def test_both_wrong(self):
        assert post({"Authorization": basic("nope", "nope")}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_bearer_scheme_rejected(self):
        assert post({"Authorization": f"Bearer {PASS}"}).status_code == 401

    def test_malformed_base64(self):
        assert post({"Authorization": "Basic !!!not-base64!!!"}).status_code == 401

    def test_no_colon(self):
        token = base64.b64encode(b"nocolon").decode()
        assert post({"Authorization": f"Basic {token}"}).status_code == 401

    def test_non_ascii_credentials(self):
        def h(u, p):
            return {"authorization": basic(u, p)}

        assert verify_datocms_request(h("üser", "pässwörd-✓"), "üser", "pässwörd-✓") is True
        assert verify_datocms_request(h("üser", "pässwörd-✗"), "üser", "pässwörd-✓") is False

    def test_rejects_everything_when_unconfigured(self):
        assert verify_datocms_request({"authorization": GOOD}, "", "") is False
        assert verify_datocms_request({"authorization": basic("", "")}, "", "") is False


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({"Authorization": GOOD}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post({"Authorization": GOOD}, body="{not json").status_code == 400

    def test_non_object_json_returns_400(self):
        assert post({"Authorization": GOOD}, body="[1,2]").status_code == 400

    def test_invalid_json_without_credentials_returns_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("entity_type,event_type", EVENTS)
    def test_handles_event(self, entity_type, event_type, capsys):
        res = post({"Authorization": GOOD}, body=json.dumps(sample_payload(entity_type, event_type)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_custom_payload(self):
        res = post({"Authorization": GOOD}, body=json.dumps({"message": "custom"}))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
