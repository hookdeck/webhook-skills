import json
import os

# Set test environment variables before importing the app
os.environ["FACTORIAL_WH_CHALLENGE"] = "2zal4e6d-test-challenge"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_factorial_request

client = TestClient(app)

CHALLENGE = os.environ["FACTORIAL_WH_CHALLENGE"]
HEADER = "x-factorial-wh-challenge"

TYPES = [
    "employees/employee/create_with_contract", "employees/employee/update",
    "employees/employee/terminate", "contracts/contract_version/create",
    "timeoff/leave/create", "timeoff/leave/approve", "timeoff/leave/reject",
    "attendance/shift/clock_in", "ats/application/create", "ats/candidate/create",
]


def sample_resource():
    # Factorial sends the resource itself: no wrapper, no event field.
    return {
        "id": 2,
        "full_name": "Ana Blanco Perez",
        "email": "ana@factorial.com",
        "active": True,
        "terminated_on": None,
        "created_at": "2010-10-06T00:00:00.000Z",
        "updated_at": "2026-10-01T10:32:11.000Z",
    }


def post(headers=None, body=None, content_type="application/json", type_=None):
    content = body if body is not None else json.dumps(sample_resource())
    return client.post(
        "/webhooks/factorial",
        params={"type": type_} if type_ else None,
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestChallengeVerification:
    def test_correct_challenge(self):
        res = post({HEADER: CHALLENGE})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"X-Factorial-WH-Challenge": CHALLENGE}).status_code == 200

    def test_wrong_challenge_same_length(self):
        assert post({HEADER: "x" * len(CHALLENGE)}).status_code == 401

    def test_wrong_challenge_different_length(self):
        assert post({HEADER: "short"}).status_code == 401

    def test_challenge_prefix_is_rejected(self):
        assert post({HEADER: CHALLENGE + "-extra"}).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_bearer_authorization_is_not_accepted(self):
        assert post({"Authorization": f"Bearer {CHALLENGE}"}).status_code == 401

    def test_non_ascii_challenge_does_not_raise(self):
        assert verify_factorial_request({HEADER: "café"}, challenge=CHALLENGE) is False
        assert verify_factorial_request({HEADER: "café"}, challenge="café") is True

    def test_unconfigured_challenge_rejects_everything(self):
        assert verify_factorial_request({HEADER: CHALLENGE}, challenge="") is False
        assert verify_factorial_request({HEADER: CHALLENGE}, challenge=CHALLENGE) is True


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({HEADER: CHALLENGE}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({HEADER: CHALLENGE}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({HEADER: CHALLENGE}, body="[1,2]").status_code == 400

    def test_invalid_json_without_challenge_is_401(self):
        assert post(body="{not json").status_code == 401


class TestSubscriptionTypeHandling:
    @pytest.mark.parametrize("type_", TYPES)
    def test_handles_type(self, type_, capsys):
        res = post({HEADER: CHALLENGE}, type_=type_)
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_no_type_hint_is_acknowledged(self, capsys):
        res = post({HEADER: CHALLENGE})
        assert res.status_code == 200
        assert "Unhandled" in capsys.readouterr().out

    def test_unknown_type_is_acknowledged(self):
        assert post({HEADER: CHALLENGE}, type_="new/thing/happen").status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
