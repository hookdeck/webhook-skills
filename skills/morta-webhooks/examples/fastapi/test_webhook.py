import hashlib
import hmac
import json
import os
import time

import pytest

# The hub signing secret is used as-is, as UTF-8 text
SECRET = "morta_test_signing_secret"
os.environ["MORTA_WEBHOOK_SECRET"] = SECRET

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_morta_webhook  # noqa: E402

client = TestClient(app)


def sign(body: str, secret: str = SECRET, t: str | None = None) -> str:
    t = str(int(time.time())) if t is None else t
    v1 = hmac.new(secret.encode(), f"{t}.{body}".encode(), hashlib.sha256).hexdigest()
    return f"t={t},v1={v1}"


def envelope(event: str, **extra) -> dict:
    return {
        "id": "1df6bd8a-b8a3-49a2-b07b-0de3f3cecbed",
        "event": event,
        "resourceId": "4e687ada-900a-4562-b493-6c6f67ffca6e",
        "change": None,
        "context": {},
        "user": None,
        "createdAt": "2020-08-27T14:20:28.405158",
        "contextProjectId": "9f1c0e2a-1b2c-4d3e-8f4a-5b6c7d8e9f00",
        **extra,
    }


def post(body: str, header: str | None = None, content_type: str = "application/json"):
    headers = {"Content-Type": content_type}
    if header:
        headers["Morta-Signature"] = header
    return client.post("/webhooks/morta", content=body, headers=headers)


BODY = json.dumps(envelope("project.created"))


class TestVerify:
    def test_accepts_valid_signature(self):
        assert verify_morta_webhook(BODY.encode(), sign(BODY), SECRET)

    def test_rejects_wrong_secret(self):
        assert not verify_morta_webhook(BODY.encode(), sign(BODY, "other"), SECRET)

    def test_rejects_tampered_body(self):
        assert not verify_morta_webhook((BODY + " ").encode(), sign(BODY), SECRET)

    def test_rejects_missing_t(self):
        assert not verify_morta_webhook(BODY.encode(), sign(BODY).split(",")[1], SECRET)

    def test_signs_t_exactly_as_sent(self):
        t = "0001700000000"
        assert verify_morta_webhook(BODY.encode(), sign(BODY, t=t), SECRET)
        assert not verify_morta_webhook(BODY.encode(), sign(BODY, t=t).replace(t, "1700000000"), SECRET)

    def test_accepts_uppercase_hex(self):
        t, v1 = sign(BODY).split(",")
        assert verify_morta_webhook(BODY.encode(), f"{t},v1={v1[3:].upper()}", SECRET)

    def test_accepts_any_matching_v1_and_ignores_other_keys(self):
        t, v1 = sign(BODY).split(",")
        assert verify_morta_webhook(BODY.encode(), f"{t},v0=abc,v1={'a' * 64},{v1}", SECRET)

    def test_rejects_malformed_v1(self):
        t = str(int(time.time()))
        assert not verify_morta_webhook(BODY.encode(), f"t={t},v1=abcd", SECRET)
        assert not verify_morta_webhook(BODY.encode(), f"t={t},v1={'z' * 64}", SECRET)
        assert not verify_morta_webhook(BODY.encode(), f"t={t},v1={'é' * 64}", SECRET)

    def test_accepts_old_timestamp_by_default(self, monkeypatch):
        monkeypatch.delenv("MORTA_WEBHOOK_TOLERANCE_SECONDS", raising=False)
        old = str(int(time.time()) - 86400)
        assert verify_morta_webhook(BODY.encode(), sign(BODY, t=old), SECRET)

    def test_rejects_old_timestamp_with_explicit_tolerance(self):
        old = str(int(time.time()) - 600)
        assert not verify_morta_webhook(BODY.encode(), sign(BODY, t=old), SECRET, tolerance=300)
        assert verify_morta_webhook(BODY.encode(), sign(BODY, t=old), SECRET, tolerance=900)

    def test_rejects_old_timestamp_when_env_set(self, monkeypatch):
        monkeypatch.setenv("MORTA_WEBHOOK_TOLERANCE_SECONDS", "300")
        old = str(int(time.time()) - 600)
        assert not verify_morta_webhook(BODY.encode(), sign(BODY, t=old), SECRET)


class TestEndpoint:
    def test_accepts_table_row_created(self, capsys):
        body = json.dumps(envelope("table.row_created", change='{"added": 2}', context={"rows": [{}, {}]}))
        assert post(body, sign(body)).status_code == 200
        assert "2 row(s) created" in capsys.readouterr().out

    def test_verifies_exact_bytes_for_any_content_type(self):
        assert post(BODY, sign(BODY), "text/plain").status_code == 200

    @pytest.mark.parametrize("name", ["project.created", "member.created", "process.response_submitted"])
    def test_handles_events(self, name):
        body = json.dumps(envelope(name))
        assert post(body, sign(body)).status_code == 200

    def test_logs_unhandled_events(self, capsys):
        body = json.dumps(envelope("table.view_read"))
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled event type: table.view_read" in capsys.readouterr().out

    def test_reads_double_encoded_change(self, capsys):
        body = json.dumps(envelope("project.duplication_failed", change='{"error": "Duplication timed out"}'))
        assert post(body, sign(body)).status_code == 200
        assert "Duplication timed out" in capsys.readouterr().out

    def test_wrong_typed_fields_are_ignored(self):
        for payload in (
            {"event": "table.row_created", "resourceId": 5, "change": 7, "context": {"rows": "nope"}},
            {"event": "project.duplication_failed", "change": "[1,2", "context": []},
            {"event": ["x"], "change": {"added": 1}, "context": None},
        ):
            body = json.dumps(payload)
            assert post(body, sign(body)).status_code == 200

    @pytest.mark.parametrize("body", ["[1,2]", '"x"', "null", "42"])
    def test_non_object_body_is_400(self, body):
        assert post(body, sign(body)).status_code == 400

    def test_invalid_json_is_400(self):
        body = "{not json"
        assert post(body, sign(body)).status_code == 400

    def test_missing_header_is_401(self):
        assert post(BODY).status_code == 401

    def test_malformed_header_is_401(self):
        assert post(BODY, "garbage").status_code == 401

    def test_bad_signature_is_401(self):
        assert post(BODY, sign(BODY, "wrong")).status_code == 401

    def test_missing_secret_is_500(self, monkeypatch):
        monkeypatch.delenv("MORTA_WEBHOOK_SECRET")
        assert post(BODY, sign(BODY)).status_code == 500
