import base64
import json
import os

USER = "metabase-hook"
PASS = "p@ss:w0rd/with+chars"

# Set test environment variables before importing the app
os.environ["METABASE_WEBHOOK_USERNAME"] = USER
os.environ["METABASE_WEBHOOK_PASSWORD"] = PASS

import pytest
from fastapi.testclient import TestClient

from main import app, verify_metabase_request

client = TestClient(app)


def basic(user, password):
    return "Basic " + base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")


GOOD = basic(USER, PASS)


def sample_payload(**overrides):
    payload = {
        "type": "alert",
        "alert_id": 12,
        "alert_creator_id": 2666,
        "alert_creator_name": "Roberto Bolaño",
        "data": {
            "type": "question",
            "question_id": 108,
            "question_name": "Sales",
            "question_url": "https://example.com/question/108",
            "visualization": "data:image/png;base64,iVBORw0KGgo=",
            "raw_data": {"cols": ["CREATED_AT", "count"], "rows": [["2024-08-01T00:00:00Z", 501]]},
        },
        "sent_at": "2024-09-30T20:16:15.76582Z",
    }
    payload.update(overrides)
    return payload


def post(auth=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    headers = {"Content-Type": content_type}
    if auth is not None:
        headers["Authorization"] = auth
    return client.post("/webhooks/metabase", content=content, headers=headers)


class TestBasicAuthentication:
    def test_correct_credentials(self):
        res = post(GOOD)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_scheme_is_case_insensitive(self):
        assert post(GOOD.replace("Basic", "bAsIc")).status_code == 200

    def test_splits_on_first_colon_and_handles_non_ascii(self):
        headers = {"authorization": basic("üser", "pä:ss")}
        assert verify_metabase_request(headers, "üser", "pä:ss") is True

    def test_wrong_password(self):
        res = post(basic(USER, "wrong"))
        assert res.status_code == 401
        assert res.headers["www-authenticate"].startswith("Basic")

    def test_wrong_username(self):
        assert post(basic("someone", PASS)).status_code == 401

    def test_both_wrong(self):
        assert post(basic("a", "b")).status_code == 401

    def test_same_length_wrong_password(self):
        assert post(basic(USER, "x" * len(PASS))).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_bearer_is_not_accepted(self):
        assert post(f"Bearer {PASS}").status_code == 401

    def test_non_base64_characters(self):
        assert post("Basic !!!not-base64!!!").status_code == 401

    def test_valid_credentials_followed_by_junk(self):
        b64 = GOOD[len("Basic "):]
        assert post(f"Basic {b64}!!").status_code == 401
        assert post(f"Basic {b64}=").status_code == 401
        assert post(f"{GOOD} extra").status_code == 401

    def test_no_colon(self):
        assert post("Basic " + base64.b64encode(b"nocolon").decode()).status_code == 401

    def test_non_ascii_header_does_not_raise(self):
        assert verify_metabase_request({"authorization": "Basic café"}, USER, PASS) is False

    def test_unconfigured_credentials_reject_everything(self):
        headers = {"authorization": GOOD}
        assert verify_metabase_request(headers, username="", password="") is False
        assert verify_metabase_request({"authorization": basic("", "")}, username="", password="") is False
        assert verify_metabase_request(headers, username=USER, password=PASS) is True


class TestBodyHandling:
    def test_any_content_type(self):
        assert post(GOOD, content_type="text/plain").status_code == 200

    def test_large_body(self):
        big = sample_payload()
        big["data"]["visualization"] = "data:image/png;base64," + "A" * (500 * 1024)
        assert post(GOOD, body=json.dumps(big)).status_code == 200

    def test_invalid_json(self):
        assert post(GOOD, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post(GOOD, body="[1,2]").status_code == 400

    def test_invalid_json_without_credentials_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    def test_handles_alert(self, capsys):
        assert post(GOOD).status_code == 200
        assert "Alert:" in capsys.readouterr().out

    def test_handles_test_alert(self, capsys):
        res = post(GOOD, body=json.dumps(sample_payload(alert_id=None)))
        assert res.status_code == 200
        assert "test alert" in capsys.readouterr().out

    def test_unknown_type_is_acknowledged(self, capsys):
        res = post(GOOD, body=json.dumps(sample_payload(type="something_new")))
        assert res.status_code == 200
        assert "Unhandled" in capsys.readouterr().out


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
