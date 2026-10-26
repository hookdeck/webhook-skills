import base64
import json
import os

# Set test environment variables before importing the app
os.environ["FORMIO_WEBHOOK_USERNAME"] = "formio-test-user"
os.environ["FORMIO_WEBHOOK_PASSWORD"] = "p@ss:word/with:colons"

import pytest
from fastapi.testclient import TestClient

from main import app, parse_basic_auth, verify_formio_request

client = TestClient(app)

USER = os.environ["FORMIO_WEBHOOK_USERNAME"]
PASS = os.environ["FORMIO_WEBHOOK_PASSWORD"]


def basic(user, pwd):
    return "Basic " + base64.b64encode(f"{user}:{pwd}".encode()).decode()


GOOD = basic(USER, PASS)


# Default payload shape from the Form.io docs: {request, response, submission, params}
def sample_payload():
    data = {"textField": "Test value", "number": 12345, "submit": True}
    return {
        "request": {"data": data, "state": "submitted", "form": "62a745944e836ccf1c0ba167"},
        "response": {},
        "submission": {"_id": "62e052a316f1ad4f786d4038", "data": data, "state": "submitted"},
        "params": {"formId": "62a745944e836ccf1c0ba167"},
    }


def send(method, auth=GOOD, body="default", content_type="application/json", url="/webhooks/formio"):
    headers = {}
    if auth is not None:
        headers["Authorization"] = auth
    kwargs = {}
    if body == "default":
        body = json.dumps(sample_payload()) if method != "GET" else None
    if body is not None:
        headers["Content-Type"] = content_type
        kwargs["content"] = body
    return client.request(method, url, headers=headers, **kwargs)


class TestBasicAuth:
    def test_correct_credentials(self):
        res = send("POST")
        assert res.status_code == 200
        assert res.json() == {"received": True, "operation": "create"}

    def test_lowercase_scheme(self):
        assert send("POST", GOOD.replace("Basic", "basic")).status_code == 200

    def test_splits_on_first_colon(self):
        assert parse_basic_auth(GOOD) == (USER.encode(), PASS.encode())

    def test_wrong_password(self):
        assert send("POST", basic(USER, "wrong")).status_code == 401

    def test_wrong_username(self):
        assert send("POST", basic("someone", PASS)).status_code == 401

    def test_different_length_credentials(self):
        assert send("POST", basic("x", "y")).status_code == 401

    def test_non_ascii_credentials_do_not_raise(self):
        assert send("POST", basic("üser", "pässwörd")).status_code == 401

    def test_non_ascii_secret_matches(self):
        headers = {"authorization": basic("üser", "pässwörd:ß")}
        assert verify_formio_request(headers, "üser", "pässwörd:ß") is True

    def test_missing_header(self):
        res = send("POST", None)
        assert res.status_code == 401
        assert res.headers["www-authenticate"].startswith("Basic")

    def test_non_basic_scheme(self):
        assert send("POST", f"Bearer {PASS}").status_code == 401

    def test_no_colon_after_decoding(self):
        bad = "Basic " + base64.b64encode(b"nocolon").decode()
        assert send("POST", bad).status_code == 401

    def test_garbage_after_scheme(self):
        assert send("POST", "Basic !!!not-base64!!!").status_code == 401

    def test_rejects_when_unconfigured(self):
        headers = {"authorization": GOOD}
        assert verify_formio_request(headers, "", "") is False
        assert verify_formio_request(headers, USER, "") is False

    def test_authenticates_before_parsing_body(self):
        assert send("POST", None, body="not json").status_code == 401


class TestMethods:
    @pytest.mark.parametrize(
        "method,operation",
        [("POST", "create"), ("PUT", "update"), ("PATCH", "update"), ("DELETE", "delete")],
    )
    def test_method_maps_to_operation(self, method, operation):
        res = send(method)
        assert res.status_code == 200
        assert res.json() == {"received": True, "operation": operation}

    def test_get_with_no_body(self):
        res = send("GET")
        assert res.status_code == 200
        assert res.json() == {"received": True, "operation": "read"}

    def test_delete_with_no_body_and_query_params(self):
        res = send("DELETE", body=None, url="/webhooks/formio?submissionId=62e052a316f1ad4f786d4038")
        assert res.status_code == 200
        assert res.json()["operation"] == "delete"

    def test_unauthenticated_get(self):
        assert send("GET", None).status_code == 401

    def test_disallowed_method(self):
        assert client.request("OPTIONS", "/webhooks/formio", headers={"Authorization": GOOD}).status_code == 405


class TestBody:
    def test_non_json_content_type(self):
        assert send("POST", body=json.dumps(sample_payload()), content_type="text/plain").status_code == 200

    def test_invalid_json(self):
        assert send("POST", body="{oops").status_code == 400

    def test_json_array(self):
        assert send("POST", body="[1,2]").status_code == 400

    def test_payload_without_submission(self):
        assert send("PUT", body="{}").status_code == 200


def test_health():
    assert client.get("/health").status_code == 200
