import hashlib
import hmac
import json
import os

# Set test environment variables before importing the app
SECRET = "test_hackerone_secret"
os.environ["HACKERONE_WEBHOOK_SECRET"] = SECRET

import pytest
from fastapi.testclient import TestClient

from main import app, verify_hackerone

client = TestClient(app)

# Shape taken from the HackerOne docs' example delivery (trimmed)
REPORT_CREATED = {
    "data": {
        "activity": {"type": "activity-bug-filed", "id": "1337", "attributes": {"message": "", "internal": False}},
        "report": {
            "id": "548",
            "type": "report",
            "attributes": {"title": "Critical vulnerability!", "state": "new", "created_at": "2020-02-25T08:05:21.405Z"},
        },
    }
}


def sign(body: bytes, secret: str = SECRET) -> str:
    """Real HackerOne algorithm: hex HMAC-SHA256 of the raw body, prefixed "sha256="."""
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body, event="report_created", signature="auto", content_type="application/json"):
    payload = body if isinstance(body, bytes) else json.dumps(body).encode()
    headers = {"Content-Type": content_type, "X-H1-Delivery": "2f7c1c1e-6a25-4e31-9d8c-1d0f4b8a0c11"}
    if event is not None:
        headers["X-H1-Event"] = event
    sig = sign(payload) if signature == "auto" else signature
    if sig is not None:
        headers["X-H1-Signature"] = sig
    return client.post("/webhooks/hackerone", content=payload, headers=headers)


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("HACKERONE_WEBHOOK_SECRET", SECRET)


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        response = post(REPORT_CREATED)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_accepts_bare_digest(self):
        payload = json.dumps(REPORT_CREATED).encode()
        assert post(payload, signature=sign(payload)[len("sha256="):]).status_code == 200

    def test_accepts_uppercase_hex(self):
        payload = json.dumps(REPORT_CREATED).encode()
        assert post(payload, signature="sha256=" + sign(payload)[7:].upper()).status_code == 200

    def test_verifies_exact_raw_bytes(self):
        payload = b'{ "data" :   {"report": {"id": "7", "attributes": {"title": "x"}}} }\n'
        assert post(payload).status_code == 200

    def test_accepts_any_content_type(self):
        assert post(REPORT_CREATED, content_type="text/plain").status_code == 200

    def test_rejects_wrong_secret(self):
        payload = json.dumps(REPORT_CREATED).encode()
        assert post(payload, signature=sign(payload, "wrong_secret")).status_code == 401

    def test_rejects_tampered_body(self):
        original = json.dumps(REPORT_CREATED).encode()
        tampered = original.replace(b"Critical", b"Trivial")
        assert post(tampered, signature=sign(original)).status_code == 401

    def test_rejects_missing_signature(self):
        assert post(REPORT_CREATED, signature=None).status_code == 401

    def test_rejects_empty_signature(self):
        assert post(REPORT_CREATED, signature="").status_code == 401

    @pytest.mark.parametrize(
        "signature",
        [
            "sha256=abcd",
            "sha256=" + "zz" * 32,
            "sha256=" + "ab" * 32 + "ab",
            "sha1=" + "ab" * 32,
            "sha256=",
        ],
    )
    def test_rejects_malformed_signature(self, signature):
        assert post(REPORT_CREATED, signature=signature).status_code == 401

    def test_rejects_empty_key_signature(self):
        # HackerOne signs with the empty string when no secret is set
        payload = json.dumps(REPORT_CREATED).encode()
        assert post(payload, signature=sign(payload, "")).status_code == 401

    def test_returns_500_when_secret_not_configured(self, monkeypatch):
        monkeypatch.delenv("HACKERONE_WEBHOOK_SECRET")
        payload = json.dumps(REPORT_CREATED).encode()
        assert post(payload, signature=sign(payload, "")).status_code == 500

    def test_verify_never_accepts_empty_secret(self):
        body = b"{}"
        assert verify_hackerone(body, sign(body, ""), "") is False
        assert verify_hackerone(body, sign(body), SECRET) is True

    def test_verify_rejects_embedded_newline(self):
        body = b"{}"
        assert verify_hackerone(body, sign(body) + "\n", SECRET) is True  # header values are stripped
        assert verify_hackerone(body, "sha256=" + sign(body)[7:71] + "\nx", SECRET) is False


class TestEventHandling:
    @pytest.mark.parametrize(
        "event",
        [
            "report_created",
            "report_new",
            "report_triaged",
            "report_bounty_awarded",
            "report_comment_created",
            "report_resolved",
            "report_closed_as_duplicate",
            "report_closed_as_informative",
            "report_closed_as_spam",
            "report_closed_as_not_applicable",
        ],
    )
    def test_handles_event(self, event, capsys):
        assert post(REPORT_CREATED, event=event).status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_logs_other_documented_events(self, capsys):
        assert post(REPORT_CREATED, event="program_hacker_joined").status_code == 200
        assert "Unhandled HackerOne event: program_hacker_joined" in capsys.readouterr().out

    def test_missing_event_header(self):
        assert post(REPORT_CREATED, event=None).status_code == 400

    def test_invalid_json(self):
        assert post(b"not json").status_code == 400

    @pytest.mark.parametrize("payload", [b"[1,2]", b'"hi"', b"null"])
    def test_non_object_body(self, payload):
        assert post(payload).status_code == 400

    @pytest.mark.parametrize(
        "body",
        [
            {"data": "x"},
            {"data": {"report": []}},
            {"data": {"report": {"id": "1", "attributes": 5}}},
            {"data": {"report": {"id": 5, "attributes": {"title": 7}}}},
            {"data": None},
        ],
    )
    def test_wrong_typed_fields_are_ignored(self, body):
        assert post(body).status_code == 200
