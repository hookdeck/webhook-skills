import json
import os

import pytest
from fastapi.testclient import TestClient

# Fillout issues no signing secret and signs nothing. The token is a random value
# you generate (openssl rand -hex 32) and configure in Fillout as the header
# value "Bearer <token>". Tests send that header instead of a signature.
TOKEN = "f3a1c9e7b5d2804611223344556677889900aabbccddeeff0011223344556677"
AUTH = f"Bearer {TOKEN}"
os.environ["FILLOUT_WEBHOOK_TOKEN"] = TOKEN

from main import (  # noqa: E402
    answers_by_id,
    app,
    parse_fillout_payload,
    processed,
    verify_fillout_auth,
)

client = TestClient(app)

# Submission object with the field names from Fillout's submission schema
SUBMISSION = {
    "submissionId": "6bcedd3a-fe26-4bcb-9ce9-d3850e38d42c",
    "submissionTime": "2026-10-21T10:15:30.000Z",
    "lastUpdatedAt": "2026-10-21T10:15:30.000Z",
    "questions": [
        {"id": "nameQ", "name": "What's your name?", "type": "ShortAnswer", "value": "Ada Lovelace"},
        {"id": "emailQ", "name": "What's your email?", "type": "EmailInput", "value": "ada@example.com"},
    ],
    "calculations": [{"id": "total", "name": "Total", "type": "number", "value": "42"}],
    "urlParameters": [{"id": "utm_source", "name": "utm_source", "value": "newsletter"}],
    "scheduling": [
        {
            "id": "sched1",
            "name": "Book a call",
            "value": {
                "fullName": "Ada Lovelace",
                "email": "ada@example.com",
                "timezone": "Europe/London",
                "eventStartTime": "2026-10-22T09:00:00.000Z",
                "eventEndTime": "2026-10-22T09:30:00.000Z",
            },
        }
    ],
    "quiz": {"score": 3, "maxScore": 5},
}

# Advanced mode: only the keys mapped in Fillout's Body section
MAPPED = {
    "submissionId": "0b8c7e1a-2222-4bcb-9ce9-d3850e38d42c",
    "name": "Grace Hopper",
    "email": "grace@example.com",
}


def post(body, auth=AUTH):
    headers = {"Content-Type": "application/json"}
    if auth is not None:
        headers["Authorization"] = auth
    content = body if isinstance(body, str) else json.dumps(body)
    return client.post("/webhooks/fillout", content=content, headers=headers)


@pytest.fixture(autouse=True)
def reset_state(monkeypatch):
    monkeypatch.setenv("FILLOUT_WEBHOOK_TOKEN", TOKEN)
    processed.clear()


class TestVerifyFilloutAuth:
    def test_accepts_exact_header_value(self):
        assert verify_fillout_auth(AUTH, TOKEN) is True

    def test_rejects_wrong_token(self):
        assert verify_fillout_auth("Bearer wrong", TOKEN) is False

    def test_compares_whole_value_including_prefix(self):
        assert verify_fillout_auth(TOKEN, TOKEN) is False
        assert verify_fillout_auth(f"bearer {TOKEN}", TOKEN) is False
        assert verify_fillout_auth(f"Bearer {TOKEN} ", TOKEN) is False

    def test_rejects_missing_header(self):
        assert verify_fillout_auth(None, TOKEN) is False

    def test_fails_closed_without_token(self):
        assert verify_fillout_auth("Bearer ", "") is False
        assert verify_fillout_auth("Bearer None", None) is False


class TestParseFilloutPayload:
    def test_full_submission(self):
        assert parse_fillout_payload(SUBMISSION) == {"kind": "submission", "submission": SUBMISSION}

    def test_wrapped_submission(self):
        assert parse_fillout_payload({"submission": SUBMISSION}) == {
            "kind": "submission",
            "submission": SUBMISSION,
        }

    def test_mapped_body(self):
        assert parse_fillout_payload(MAPPED) == {"kind": "mapped", "fields": MAPPED}

    def test_answers_by_id(self):
        assert answers_by_id(SUBMISSION["questions"]) == {
            "nameQ": "Ada Lovelace",
            "emailQ": "ada@example.com",
        }


class TestWebhookEndpoint:
    def test_full_submission_returns_200(self):
        response = post(SUBMISSION)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_mapped_body_returns_200(self):
        response = post(MAPPED)
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_wrapped_submission_returns_200(self):
        assert post({"submission": SUBMISSION}).status_code == 200

    def test_missing_header_returns_401(self):
        assert post(SUBMISSION, auth=None).status_code == 401

    def test_wrong_token_returns_401(self):
        assert post(SUBMISSION, auth="Bearer not-the-token").status_code == 401

    def test_bare_token_returns_401(self):
        assert post(SUBMISSION, auth=TOKEN).status_code == 401

    def test_authenticates_before_parsing(self):
        assert post("{not json", auth=None).status_code == 401

    def test_invalid_json_returns_400(self):
        assert post("{not json").status_code == 400

    def test_non_object_json_returns_400(self):
        assert post("[1,2,3]").status_code == 400

    def test_missing_token_config_returns_500(self, monkeypatch):
        monkeypatch.delenv("FILLOUT_WEBHOOK_TOKEN")
        assert post(SUBMISSION).status_code == 500

    def test_duplicate_submission_is_acknowledged(self):
        assert post(SUBMISSION).json() == {"received": True}
        response = post(SUBMISSION)
        assert response.status_code == 200
        assert response.json() == {"received": True, "duplicate": True}

    def test_edited_submission_is_processed_again(self):
        post(SUBMISSION)
        edited = {**SUBMISSION, "lastUpdatedAt": "2026-10-21T11:00:00.000Z"}
        assert post(edited).json() == {"received": True}
