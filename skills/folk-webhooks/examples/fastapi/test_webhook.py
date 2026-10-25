# Generated with: folk-webhooks skill
# https://github.com/hookdeck/webhook-skills

import base64
import hashlib
import hmac
import json
import os
import time
import uuid

import pytest

# folk secrets follow Standard Webhooks: "whsec_" + base64(key bytes), for
# example "whsec_QWFSUzl1QUVoQW1kdWtpTnJRTUFpbXNlZmxLTg==". The HMAC key is the
# decoded part.
SECRET = "whsec_" + base64.b64encode(b"folk-test-signing-key-0123456789").decode()

os.environ["FOLK_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)

SOURCE = "https://api.folk.app/v1/webhooks/wbk_2f15ec4f-0f70-4884-a43d-1f88ef7a6665"


def sign(raw_body: str, msg_id: str, timestamp: str, secret: str = SECRET) -> str:
    """Sign exactly like Standard Webhooks does for folk deliveries."""
    key = base64.b64decode(secret[len("whsec_"):])
    digest = hmac.new(key, f"{msg_id}.{timestamp}.{raw_body}".encode(), hashlib.sha256).digest()
    return "v1," + base64.b64encode(digest).decode()


def now() -> int:
    return int(time.time())


def signed_headers(raw_body, msg_id=None, timestamp=None, secret=SECRET, signature=None, content_type="application/json"):
    msg_id = msg_id or f"evt_{uuid.uuid4()}"
    ts = str(timestamp if timestamp is not None else now())
    return {
        "content-type": content_type,
        "webhook-id": msg_id,
        "webhook-timestamp": ts,
        "webhook-signature": signature or sign(raw_body, msg_id, ts, secret),
    }


def post(raw_body: str, headers: dict):
    return client.post("/webhooks/folk", content=raw_body, headers=headers)


def event(event_type: str, data: dict) -> dict:
    return {
        "id": f"evt_{uuid.uuid4()}",
        "type": event_type,
        "createdAt": "2025-09-30T09:55:52.715Z",
        "source": SOURCE,
        "data": data,
    }


def person_created() -> str:
    return json.dumps(
        event(
            "person.created",
            {
                "id": "per_05837e2d-9bf7-4f17-8729-e95f1be4de67",
                "url": "https://api.folk.app/v1/people/per_05837e2d-9bf7-4f17-8729-e95f1be4de67",
            },
        )
    )


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("FOLK_WEBHOOK_SECRET", SECRET)


class TestValidSignatures:
    def test_person_created(self):
        body = person_created()
        res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_person_updated_with_changes(self):
        body = json.dumps(
            event(
                "person.updated",
                {
                    "id": "per_05837e2d-9bf7-4f17-8729-e95f1be4de67",
                    "url": "https://api.folk.app/v1/people/per_05837e2d-9bf7-4f17-8729-e95f1be4de67",
                    "changes": [{"path": ["firstName"], "type": "set", "value": "John"}],
                },
            )
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    def test_person_deleted_with_details(self):
        body = json.dumps(
            event(
                "person.deleted",
                {
                    "id": "per_05837e2d-9bf7-4f17-8729-e95f1be4de67",
                    "url": "https://api.folk.app/v1/people/per_05837e2d-9bf7-4f17-8729-e95f1be4de67",
                    "details": {"name": "John Doe", "emails": ["john@doe.com"]},
                },
            )
        )
        res = post(body, signed_headers(body))
        assert res.status_code == 200

    @pytest.mark.parametrize(
        "event_type",
        [
            "person.groups_updated",
            "person.workspace_interaction_metadata_updated",
            "company.created",
            "company.updated",
            "company.deleted",
            "company.groups_updated",
            "object.created",
            "object.updated",
            "object.deleted",
            "note.created",
            "note.updated",
            "note.deleted",
            "reminder.created",
            "reminder.updated",
            "reminder.deleted",
            "reminder.triggered",
            "person_enrichment.finished",
        ],
    )
    def test_other_event_types(self, event_type, caplog):
        body = json.dumps(event(event_type, {"id": "x_1", "url": "https://api.folk.app/v1/x/x_1"}))
        with caplog.at_level("INFO"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled" not in caplog.text

    def test_unknown_event_type_acknowledged(self, caplog):
        body = json.dumps(event("widget.exploded", {}))
        with caplog.at_level("INFO"):
            res = post(body, signed_headers(body))
        assert res.status_code == 200
        assert "Unhandled folk event type" in caplog.text

    def test_any_content_type_verifies(self):
        body = person_created()
        res = post(body, signed_headers(body, content_type="text/plain"))
        assert res.status_code == 200

    def test_multiple_signatures_one_valid(self):
        body = person_created()
        headers = signed_headers(body)
        headers["webhook-signature"] = "v1,bm90LXRoZS1yaWdodC1zaWc= " + headers["webhook-signature"]
        assert post(body, headers).status_code == 200

    def test_redelivery_with_same_webhook_id_is_duplicate(self):
        body = person_created()
        msg_id = f"evt_retry_{uuid.uuid4().hex}"
        first = post(body, signed_headers(body, msg_id=msg_id))
        second = post(body, signed_headers(body, msg_id=msg_id))
        assert first.status_code == 200
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestInvalidRequests:
    def test_missing_headers(self):
        res = post(person_created(), {"content-type": "application/json"})
        assert res.status_code == 400

    def test_bad_signature(self):
        body = person_created()
        res = post(body, signed_headers(body, signature="v1,aW52YWxpZA=="))
        assert res.status_code == 400

    def test_other_webhook_secret(self):
        other = "whsec_" + base64.b64encode(b"another-webhook-secret-0123456789").decode()
        body = person_created()
        res = post(body, signed_headers(body, secret=other))
        assert res.status_code == 400

    def test_tampered_body(self):
        body = person_created()
        headers = signed_headers(body)
        res = post(body.replace("person.created", "person.deleted"), headers)
        assert res.status_code == 400

    def test_stale_timestamp(self):
        body = person_created()
        res = post(body, signed_headers(body, timestamp=now() - 600))
        assert res.status_code == 400

    def test_undecoded_secret_key(self):
        body = person_created()
        msg_id, ts = "evt_undecoded", str(now())
        wrong = base64.b64encode(
            hmac.new(SECRET[len("whsec_"):].encode(), f"{msg_id}.{ts}.{body}".encode(), hashlib.sha256).digest()
        ).decode()
        res = post(body, signed_headers(body, msg_id=msg_id, timestamp=ts, signature=f"v1,{wrong}"))
        assert res.status_code == 400


class TestFailClosed:
    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("FOLK_WEBHOOK_SECRET", raising=False)
        body = person_created()
        res = post(body, signed_headers(body))
        assert res.status_code == 500
