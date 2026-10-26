import hashlib
import hmac
import json
import os

# Set test environment variables before importing the app
os.environ["LEARNUPON_WEBHOOK_SECRET"] = "test_learnupon_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, seen_webhook_ids, verify_learnupon_signature

client = TestClient(app)

SECRET = os.environ["LEARNUPON_WEBHOOK_SECRET"]

# Published test vector from LearnUpon's docs (webhooks v2.0 signature example).
VECTOR = {
    "secret": "00000AB00C0D0E00F0A",
    "body": "{\"data\":[{\"enrollmentId\":19090500,\"user\":{\"userId\":291164,\"email\":\"beatrice.dansk@yourdomain.com\",\"username\":null},\"courseId\":1807600,\"dueDate\":\"2024-03-03T18:13:09.000Z\",\"eventCreated\":\"2024-02-02T18:13:10.038Z\",\"wasRecertified\":false}]}",
    "signature": "a403759157e609bf3852001ff9d83db59b454a82841c4369b0e65d066035af45",
}

EVENTS = [
    "user_created", "user_updated",
    "course_cloning_complete", "course_completion", "course_updated",
    "module_complete", "purchase_completion",
    "badge_awarded", "badge_revoked",
    "course_enrollment", "course_unenrollment",
    "learning_path_enrollment", "learning_path_updated", "learning_path_completion",
    "event_session_creation", "event_session_updated", "event_session_canceled",
    "learning_journey_enrollment", "learning_journey_completion", "learning_journey_blocked",
    "learning_journey_deleted", "learning_journey_archived",
]


@pytest.fixture(autouse=True)
def clear_seen():
    seen_webhook_ids.clear()


# Based on the sample course_enrollment webhook in the LearnUpon docs.
def sample_payload():
    return {
        "data": [
            {
                "eventCreated": "2023-12-14T19:41:35.463Z",
                "user": {"userId": 285900, "email": "bella.bell@yourdomain.com", "username": None},
                "enrollmentId": 18976600,
                "dueDate": None,
                "courseId": 2712800,
                "wasRecertified": False,
            }
        ]
    }


def sign(body, secret=SECRET):
    if isinstance(body, str):
        body = body.encode("utf-8")
    return hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()


_counter = {"n": 0}


def post(body=None, signature="auto", event_type="course_enrollment", webhook_id=None,
         content_type="application/json"):
    if body is None:
        body = json.dumps(sample_payload())
    _counter["n"] += 1
    headers = {
        "Content-Type": content_type,
        "X-Webhook-Type": event_type,
        "X-Webhook-ID": webhook_id or f"wh-{_counter['n']}",
    }
    sig = sign(body) if signature == "auto" else signature
    if sig is not None:
        headers["X-Webhook-Signature"] = sig
    return client.post("/webhooks/learnupon", content=body, headers=headers)


class TestSignatureVerification:
    def test_accepts_published_test_vector(self):
        assert verify_learnupon_signature(VECTOR["body"].encode("utf-8"), VECTOR["signature"], VECTOR["secret"])

    def test_accepts_test_vector_over_http(self, monkeypatch):
        monkeypatch.setenv("LEARNUPON_WEBHOOK_SECRET", VECTOR["secret"])
        res = post(VECTOR["body"], signature=VECTOR["signature"])
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_test_vector_with_different_secret(self):
        assert not verify_learnupon_signature(VECTOR["body"].encode("utf-8"), VECTOR["signature"], "other-secret")

    def test_accepts_valid_signature(self):
        res = post()
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex_signature(self):
        body = json.dumps(sample_payload())
        assert post(body, signature=sign(body).upper()).status_code == 200

    def test_accepts_any_content_type(self):
        assert post(content_type="text/plain").status_code == 200

    def test_rejects_missing_signature(self):
        assert post(signature=None).status_code == 401

    def test_rejects_empty_signature(self):
        assert post(signature="").status_code == 401

    def test_rejects_wrong_length_signature(self):
        assert post(signature="abcd").status_code == 401

    def test_rejects_non_hex_64_character_signature(self):
        assert post(signature="z" * 64).status_code == 401

    def test_rejects_prefixed_signature(self):
        body = json.dumps(sample_payload())
        assert post(body, signature=f"sha256={sign(body)}").status_code == 401

    def test_rejects_wrong_secret(self):
        body = json.dumps(sample_payload())
        assert post(body, signature=sign(body, "wrong_secret")).status_code == 401

    def test_rejects_tampered_body(self):
        body = json.dumps(sample_payload())
        assert post(body.replace("18976600", "18976601"), signature=sign(body)).status_code == 401

    def test_verifies_exact_bytes_not_reserialised_json(self):
        pretty = json.dumps(sample_payload(), indent=2)
        assert post(pretty).status_code == 200
        assert post(pretty, signature=sign(json.dumps(sample_payload()))).status_code == 401

    def test_non_ascii_signature_header_does_not_raise(self):
        assert not verify_learnupon_signature(b"{}", "é" * 64, SECRET)

    def test_rejects_everything_when_secret_unset(self, monkeypatch):
        body = json.dumps(sample_payload()).encode()
        assert not verify_learnupon_signature(body, sign(body), "")
        monkeypatch.delenv("LEARNUPON_WEBHOOK_SECRET")
        assert not verify_learnupon_signature(body, sign(body))


class TestBodyHandling:
    def test_returns_400_for_invalid_json_after_verifying(self):
        assert post("{not json").status_code == 400

    def test_returns_400_when_data_is_not_a_list(self):
        assert post('{"data":{}}').status_code == 400

    def test_returns_401_not_400_for_invalid_json_without_signature(self):
        assert post("{not json", signature=None).status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type", EVENTS)
    def test_handles_event(self, event_type, capsys):
        res = post(event_type=event_type)
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unknown_events(self):
        assert post(event_type="something_new").status_code == 200

    def test_loops_over_every_item_in_data(self, capsys):
        payload = sample_payload()
        payload["data"].append({**payload["data"][0], "courseId": 99})
        assert post(json.dumps(payload)).status_code == 200
        assert capsys.readouterr().out.count("Course enrollment") == 2

    def test_dedupes_retried_deliveries(self, capsys):
        first = post(webhook_id="same-id")
        retry = post(webhook_id="same-id")
        assert first.json() == {"received": True}
        assert retry.status_code == 200
        assert retry.json() == {"received": True, "duplicate": True}
        assert capsys.readouterr().out.count("Course enrollment") == 1


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}
