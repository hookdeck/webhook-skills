import json
import os

# Set test environment variables before importing the app
SECRET = "Bearer test_strapi_secret_0123456789"
os.environ["STRAPI_WEBHOOK_SECRET"] = SECRET
os.environ.pop("STRAPI_WEBHOOK_HEADER", None)  # default: Authorization

import pytest
from fastapi.testclient import TestClient

from main import app, verify_strapi_request

client = TestClient(app)

EVENTS = [
    "entry.create", "entry.update", "entry.delete", "entry.publish", "entry.unpublish",
    "entry.draft-discard", "media.create", "media.update", "media.delete",
    "review-workflows.updateEntryStage", "releases.publish",
]


def sample_payload(event="entry.create"):
    if event.startswith("media."):
        return {"event": event, "createdAt": "2026-09-09T09:03:55.238Z",
                "media": {"id": 1, "name": "photo.png", "url": "/uploads/photo.png"}}
    if event == "review-workflows.updateEntryStage":
        return {"event": event, "createdAt": "2023-06-26T15:46:35.664Z", "model": "model", "uid": "uid",
                "entity": {"id": 2},
                "workflow": {"id": 1, "stages": {"from": {"id": 1, "name": "Stage 1"},
                                                  "to": {"id": 2, "name": "Stage 2"}}}}
    if event == "releases.publish":
        return {"event": event, "createdAt": "2024-02-21T16:45:36.877Z", "isPublished": True,
                "release": {"id": 2, "name": "Fall Winter highlights"}}
    return {
        "event": event,
        "createdAt": "2026-09-09T08:49:26.158Z",
        "model": "address",
        "uid": "api::address.address",
        "entry": {"id": 1, "documentId": "w7vfs319acmaxnurjk5vaaza", "city": "Paris", "publishedAt": None},
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/strapi",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestCredentialVerification:
    def test_exact_value_with_bearer_prefix(self):
        res = post({"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"authorization": SECRET}).status_code == 200

    def test_bare_token_without_bearer_prefix_rejected(self):
        # The whole header value is compared; nothing is stripped.
        assert post({"Authorization": SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({"Authorization": "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({"Authorization": "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        # Header values are latin-1 on the wire; compare_digest on str would raise TypeError.
        assert verify_strapi_request({"authorization": "Bearer tést"}) is False

    def test_unset_secret_rejects_everything(self):
        assert verify_strapi_request({"authorization": SECRET}, secret="") is False
        saved = os.environ.pop("STRAPI_WEBHOOK_SECRET")
        try:
            assert verify_strapi_request({"authorization": SECRET}) is False
        finally:
            os.environ["STRAPI_WEBHOOK_SECRET"] = saved


class TestCustomHeaderName:
    def test_reads_configured_header(self, monkeypatch):
        monkeypatch.setenv("STRAPI_WEBHOOK_HEADER", "X-Strapi-Secret")
        assert post({"x-strapi-secret": SECRET}).status_code == 200
        assert post({"Authorization": SECRET}).status_code == 401


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json_after_auth_is_400(self):
        assert post({"Authorization": SECRET}, body="{not json").status_code == 400

    def test_non_object_json_is_400(self):
        assert post({"Authorization": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_credential_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, capsys):
        res = post({"Authorization": SECRET}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_falls_back_to_event_header(self, capsys):
        res = post(
            {"Authorization": SECRET, "X-Strapi-Event": "entry.publish"},
            body=json.dumps({"model": "address", "entry": {"documentId": "abc"}}),
        )
        assert res.status_code == 200
        assert "Entry published" in capsys.readouterr().out

    def test_unknown_event_acknowledged(self):
        res = post({"Authorization": SECRET}, body=json.dumps(sample_payload("something.new")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
