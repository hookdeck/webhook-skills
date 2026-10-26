import hashlib
import hmac
import json
import os

# TutorCruncher signs with the integration's private API key (used as UTF-8 bytes, as-is).
SECRET = "test_tutorcruncher_private_api_key_0123456789"

# Set test environment variables before importing the app
os.environ["TUTORCRUNCHER_WEBHOOK_SECRET"] = SECRET

import pytest
from fastapi.testclient import TestClient

from main import app, verify_tutorcruncher_signature

client = TestClient(app)


# Based on the documented CREATED_A_CONTRACTOR sample.
def sample_payload(action="CREATED_A_CONTRACTOR"):
    return {
        "events": [
            {
                "action": action,
                "verb": "Created a Tutor",
                "timestamp": "2025-03-05T15:26:20.558919Z",
                "branch": 590,
                "actor": {"name": "Jane Smith", "id": 1621, "user_id": 1611, "url": ""},
                "extra_msg": "Created via the API.",
                "subject": {
                    "model": "Tutor",
                    "url": "https://app.tutorcruncher.com/api/contractors/1623/",
                    "id": 1623,
                    "status": "approved",
                    "last_name": "Gallagher",
                    "email": "liam@example.com",
                },
            }
        ]
    }


def sign(body: bytes, secret=SECRET) -> str:
    """Bare lowercase hex HMAC-SHA256 of the raw body bytes: no prefix, id or timestamp."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def send(body, method="POST", headers=None, content_type="application/json", signed=True):
    if isinstance(body, (dict, list)):
        body = json.dumps(body)
    if isinstance(body, str):
        body = body.encode()
    hdrs = {}
    if content_type:
        hdrs["Content-Type"] = content_type
    if signed:
        hdrs["Webhook-Signature"] = sign(body)
    hdrs.update(headers or {})
    return client.request(method, "/webhooks/tutorcruncher", content=body, headers=hdrs)


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = send(sample_payload())
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex_digest(self):
        body = json.dumps(sample_payload()).encode()
        res = send(body, headers={"Webhook-Signature": sign(body).upper()})
        assert res.status_code == 200

    def test_verifies_exact_bytes_whatever_the_content_type(self):
        res = send('{ "events" : [ ] }\n', content_type="text/plain")
        assert res.status_code == 200

    def test_rejects_missing_signature(self):
        assert send(sample_payload(), signed=False).status_code == 401

    def test_rejects_empty_signature(self):
        assert send(sample_payload(), headers={"Webhook-Signature": ""}).status_code == 401

    def test_rejects_wrong_key(self):
        body = json.dumps(sample_payload()).encode()
        res = send(body, headers={"Webhook-Signature": sign(body, "another_key")})
        assert res.status_code == 401

    def test_rejects_tampered_body(self):
        body = json.dumps(sample_payload()).encode()
        res = send(body.replace(b"1623", b"9999"), headers={"Webhook-Signature": sign(body)})
        assert res.status_code == 401

    def test_rejects_malformed_digests(self):
        body = json.dumps(sample_payload()).encode()
        good = sign(body)
        for bad in [good[:63], good + "0", "sha256=" + good, "v1," + good, "z" * 64]:
            assert send(body, headers={"Webhook-Signature": bad}).status_code == 401

    def test_unconfigured_secret_never_verifies(self):
        assert verify_tutorcruncher_signature(b"{}", sign(b"{}", ""), "") is False
        assert verify_tutorcruncher_signature(b"{}", None, SECRET) is False


class TestMethods:
    @pytest.mark.parametrize("method", ["PUT", "PATCH", "DELETE"])
    def test_verifies_and_accepts_method_with_body(self, method):
        assert send(sample_payload(), method=method).status_code == 200

    @pytest.mark.parametrize("method", ["GET", "DELETE", "POST"])
    def test_acknowledges_verified_empty_body(self, method):
        # Signed over zero bytes, then acknowledged rather than rejected as invalid JSON.
        res = send(b"", method=method, content_type=None)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_unsigned_get(self):
        assert send(b"", method="GET", content_type=None, signed=False).status_code == 401


class TestEvents:
    @pytest.mark.parametrize(
        "action,message",
        [
            ("CREATED_A_CONTRACTOR", "Tutor created"),
            ("CHANGED_CONTRACTOR_STATUS", "Tutor status changed"),
            ("CLIENT_ENQUIRY", "Client enquiry"),
            ("CREATED_AN_APPOINTMENT", "Lesson created"),
            ("RAISED_INVOICE", "Invoice raised"),
        ],
    )
    def test_handles_action(self, action, message, capsys):
        assert send(sample_payload(action)).status_code == 200
        assert message in capsys.readouterr().out

    def test_handles_every_element_of_events(self, capsys):
        payload = {
            "events": [
                sample_payload("CREATED_A_CONTRACTOR")["events"][0],
                sample_payload("RAISED_INVOICE")["events"][0],
            ]
        }
        assert send(payload).status_code == 200
        out = capsys.readouterr().out
        assert "Tutor created" in out and "Invoice raised" in out

    def test_acknowledges_unknown_action(self, capsys):
        assert send(sample_payload("LOGIN")).status_code == 200
        assert "Unhandled action: LOGIN" in capsys.readouterr().out


class TestUntrustedPayloadShapes:
    def test_invalid_json_is_400(self):
        assert send("not json").status_code == 400

    @pytest.mark.parametrize(
        "body", ["[]", '"text"', "42", "null", "{}", '{"events":"x"}', '{"events":{"action":"LOGIN"}}']
    )
    def test_wrong_shapes_are_400(self, body):
        assert send(body).status_code == 400

    def test_non_utf8_body_is_400(self):
        assert send(b"\xff\xfe{").status_code == 400

    def test_wrong_typed_elements_and_fields_are_ignored(self):
        payload = {
            "events": [
                None,
                7,
                "x",
                [],
                {"action": 5},
                {"action": "CREATED_A_CONTRACTOR", "subject": "oops"},
                {"action": "RAISED_INVOICE", "subject": None},
            ]
        }
        assert send(payload).status_code == 200
