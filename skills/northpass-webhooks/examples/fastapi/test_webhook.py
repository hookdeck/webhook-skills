import base64
import hashlib
import hmac
import json
import os

# Set test environment variables before importing the app
SECRET = "test_northpass_shared_secret"
os.environ["NORTHPASS_WEBHOOK_SECRET"] = SECRET

import pytest
from fastapi.testclient import TestClient

from main import app, verify_northpass_signature

client = TestClient(app)

HEADER = "X-Northpass-Hmac-SHA256"


def sign(body: bytes, secret: str = SECRET) -> str:
    """Real signature: base64 HMAC-SHA256 of the raw body, keyed by the shared secret."""
    return base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()


PERSON = {
    "id": "abcdefghi-1234-jklm-5678-nopqrstuvwxy",
    "type": "people",
    "attributes": {"name": "Jill Smith", "email": "jillsmith@example.com", "created_at": "2022-04-08T17:55:42Z"},
}
COURSE = {"id": "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzz", "type": "courses", "attributes": {"name": "Intro"}}


def rel(course=True):
    out = {"person": {"data": {"id": PERSON["id"], "type": "people"}}}
    if course:
        out["course"] = {"data": {"id": COURSE["id"], "type": "courses"}}
    return out


# Compact versions of the documented sample payloads: (data.type, data fields)
EVENTS = [
    ("learner_created_events", {"included": [PERSON], "attributes": {"created_at": "2022-04-08T17:55:43Z"}, "relationships": rel(False)}),
    ("person_activated_events", {"included": [PERSON], "attributes": {"created_at": "2022-04-08T17:55:43Z"}, "relationships": rel(False)}),
    ("learner_enrolled_to_course_events", {"included": [PERSON, COURSE], "attributes": {"created_at": "2022-04-08T17:55:43Z"}, "relationships": rel()}),
    ("learner_started_course_events", {"included": [PERSON, COURSE], "attributes": {"created_at": "2022-04-08T17:55:43Z", "course_version": 1, "course_attempt_number": 1}, "relationships": rel()}),
    ("course_completed_events", {"included": [PERSON, COURSE], "attributes": {"created_at": "2022-04-08T17:58:47Z", "course_version": 1, "course_attempt_number": 1}, "relationships": rel()}),
    ("quiz_completed_events", {"attributes": {"value": 90, "created_at": "2022-04-08T17:58:00Z", "minimum_passing_score": 70, "attempts_remaining": 2}, "relationships": rel()}),
    ("course_published_events", {"attributes": {"published_at": "2024-07-05T11:19:07Z", "required_for": "progressing_learners", "version_number": 9}, "relationships": rel()}),
]

_counter = 0


def sample_payload(event_type="learner_created_events", fields=None):
    global _counter
    _counter += 1
    return {
        "data": {
            "id": f"11111111-1111-1111-1111-{_counter:012d}",
            "type": event_type,
            "links": {},
            **(EVENTS[0][1] if fields is None else fields),
        }
    }


def post(body: bytes, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature is not None:
        headers[HEADER] = signature
    return client.post("/webhooks/northpass", content=body, headers=headers)


def body_of(payload) -> bytes:
    return json.dumps(payload).encode()


class TestSignatureVerification:
    def test_accepts_a_valid_signature(self):
        body = body_of(sample_payload())
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_verifies_the_exact_raw_bytes(self):
        body = b'{ "data" : {"id":"e-1",  "type":"learner_created_events"} }\n'
        assert post(body, sign(body)).status_code == 200

    def test_accepts_any_content_type(self):
        body = body_of(sample_payload())
        assert post(body, sign(body), content_type="text/plain").status_code == 200

    def test_rejects_a_missing_signature(self):
        assert post(body_of(sample_payload())).status_code == 401

    def test_rejects_an_empty_signature(self):
        assert post(body_of(sample_payload()), "").status_code == 401

    def test_rejects_a_signature_made_with_the_wrong_secret(self):
        body = body_of(sample_payload())
        assert post(body, sign(body, "other_secret")).status_code == 401

    def test_rejects_a_tampered_body(self):
        body = body_of(sample_payload())
        assert post(body + b" ", sign(body)).status_code == 401

    def test_rejects_malformed_signatures_without_error(self):
        body = body_of(sample_payload())
        good = sign(body)
        for bad in ["short", good[:-1], good + "A", good[:-1] + "A", f"sha256={good}"]:
            assert post(body, bad).status_code == 401

    def test_non_ascii_header_value_is_rejected_not_a_500(self):
        assert verify_northpass_signature(b"{}", "é" * 44, SECRET) is False

    def test_rejects_a_base64_value_that_decodes_to_the_same_bytes_but_is_not_canonical(self):
        body = b'{"data":{}}'
        digest = hmac.new(SECRET.encode(), body, hashlib.sha256).digest()
        canonical = base64.b64encode(digest).decode()
        # The last base64 char before "=" carries 2 unused low bits; set a stray one.
        alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        stray = canonical[:42] + alphabet[alphabet.index(canonical[42]) ^ 1] + "="
        assert base64.b64decode(stray, validate=True) == digest
        assert verify_northpass_signature(body, canonical, SECRET) is True
        assert verify_northpass_signature(body, stray, SECRET) is False

    def test_rejects_everything_when_the_secret_is_unset(self):
        body = b"{}"
        assert verify_northpass_signature(body, sign(body), "") is False
        assert verify_northpass_signature(body, sign(body), None) is False


class TestBodyHandling:
    def test_returns_400_for_invalid_json_after_verifying_the_signature(self):
        body = b"{not json"
        assert post(body, sign(body)).status_code == 400

    def test_returns_400_when_there_is_no_data_object(self):
        body = body_of({"foo": "bar"})
        assert post(body, sign(body)).status_code == 400

    def test_returns_401_not_400_for_invalid_json_without_a_signature(self):
        assert post(b"{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event_type,fields", EVENTS)
    def test_handles_documented_events(self, event_type, fields, capsys):
        body = body_of(sample_payload(event_type, fields))
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_and_logs_events_it_does_not_handle(self, capsys):
        body = body_of(sample_payload("learning_path_started_events", {"attributes": {"attempt_number": 1}}))
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled event type: learning_path_started_events" in capsys.readouterr().out

    def test_de_duplicates_on_the_event_id(self, capsys):
        body = body_of(sample_payload("course_completed_events", EVENTS[4][1]))
        first = post(body, sign(body))
        second = post(body, sign(body))
        assert first.json() == {"received": True}
        assert second.json() == {"received": True, "duplicate": True}
        assert capsys.readouterr().out.count("Course completed") == 1


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}
