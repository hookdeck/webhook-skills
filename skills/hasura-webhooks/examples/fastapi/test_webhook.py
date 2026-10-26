import json
import os

# Set test environment variables before importing the app
os.environ["HASURA_WEBHOOK_HEADER"] = "X-Webhook-Secret"
os.environ["HASURA_WEBHOOK_SECRET"] = "Bearer test_hasura_secret_0123456789"

import pytest
from fastapi.testclient import TestClient
from starlette.datastructures import Headers

from main import app, verify_hasura_request

client = TestClient(app)

HEADER = os.environ["HASURA_WEBHOOK_HEADER"]
SECRET = os.environ["HASURA_WEBHOOK_SECRET"]

OPS = ["INSERT", "UPDATE", "DELETE", "MANUAL"]


def sample_payload(op="INSERT"):
    return {
        "created_at": "2020-07-29T10:00:00.000Z",
        "delivery_info": {"current_retry": 0, "max_retries": 0},
        "event": {
            "data": {
                "new": None if op == "DELETE" else {"id": 1, "name": "John"},
                "old": None if op in ("INSERT", "MANUAL") else {"id": 1, "name": "Jane"},
            },
            "op": op,
            "session_variables": {"x-hasura-role": "admin"},
            "trace_context": {"span_id": "123", "trace_id": "456"},
        },
        "id": "123e4567-e89b-12d3-a456-426614174000",
        "table": {"name": "users", "schema": "public"},
        "trigger": {"name": "insert_user"},
    }


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/hasura",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestHeaderVerification:
    def test_correct_value(self):
        res = post({HEADER: SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({HEADER.lower(): SECRET}).status_code == 200

    def test_whole_value_is_compared_including_bearer(self):
        assert post({HEADER: SECRET.replace("Bearer ", "")}).status_code == 401

    def test_wrong_value_same_length(self):
        assert post({HEADER: "x" * len(SECRET)}).status_code == 401

    def test_wrong_value_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_secret_under_other_header_is_ignored(self):
        assert post({"Authorization": SECRET}).status_code == 401

    def test_non_ascii_value_does_not_raise(self):
        # compare_digest on str raises TypeError for non-ASCII; we compare bytes.
        assert verify_hasura_request({HEADER: "päss"}, name=HEADER, secret="pass") is False
        assert verify_hasura_request({HEADER: "päss"}, name=HEADER, secret="päss") is True

    def test_default_header_is_authorization(self, monkeypatch):
        monkeypatch.delenv("HASURA_WEBHOOK_HEADER")
        assert verify_hasura_request(Headers({"authorization": "abc"}), secret="abc") is True

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_hasura_request({HEADER: SECRET}, name=HEADER, secret="") is False
        assert verify_hasura_request({HEADER: SECRET}, name=HEADER, secret=SECRET) is True


class TestBodyHandling:
    def test_any_content_type(self):
        assert post({HEADER: SECRET}, content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: SECRET}, body="[1,2]").status_code == 400

    def test_missing_event_op(self):
        assert post({HEADER: SECRET}, body=json.dumps({"event": {}})).status_code == 400

    def test_invalid_json_without_header_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("op", OPS)
    def test_handles_op(self, op, capsys):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload(op)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_op_is_acknowledged(self):
        res = post({HEADER: SECRET}, body=json.dumps(sample_payload("SOMETHING_NEW")))
        assert res.status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
