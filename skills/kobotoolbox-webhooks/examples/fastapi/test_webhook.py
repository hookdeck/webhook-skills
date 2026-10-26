import base64
import json
import os

# Set test environment variables before importing the app
os.environ["KOBOTOOLBOX_WEBHOOK_USERNAME"] = "kobo-hook"
os.environ["KOBOTOOLBOX_WEBHOOK_PASSWORD"] = "p@ss:word/with:colons"

from fastapi.testclient import TestClient

from main import app, parse_basic_auth, verify_kobotoolbox_request

client = TestClient(app)

USER = os.environ["KOBOTOOLBOX_WEBHOOK_USERNAME"]
PASS = os.environ["KOBOTOOLBOX_WEBHOOK_PASSWORD"]

SUBMISSION = {
    "_id": 1234,
    "_uuid": "1f4f1a52-3c1e-4d0b-9a55-0c1f0e2a7a11",
    "_submission_time": "2026-10-22T09:30:00",
    "_xform_id_string": "aXyZ123",
    "name": "Amina",
    "age": "34",
}

XML = '<aXyZ123 id="aXyZ123"><name>Amina</name><age>34</age></aXyZ123>'


def basic(user, password, scheme="Basic"):
    token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode()
    return f"{scheme} {token}"


def post(auth=None, body=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if auth:
        headers["Authorization"] = auth
    content = body if body is not None else json.dumps(SUBMISSION)
    return client.post("/webhooks/kobotoolbox", content=content, headers=headers)


class TestBasicAuth:
    def test_correct_credentials(self):
        res = post(basic(USER, PASS))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_scheme_is_case_insensitive(self):
        assert post(basic(USER, PASS, "basic")).status_code == 200

    def test_splits_on_first_colon(self):
        assert parse_basic_auth(basic("u", "a:b:c")) == (b"u", b"a:b:c")

    def test_wrong_password(self):
        assert post(basic(USER, "wrong")).status_code == 401

    def test_wrong_username(self):
        assert post(basic("someone", PASS)).status_code == 401

    def test_both_wrong(self):
        assert post(basic("x", "y")).status_code == 401

    def test_missing_header(self):
        assert post().status_code == 401

    def test_non_basic_scheme(self):
        assert post(f"Bearer {PASS}").status_code == 401

    def test_malformed_base64_and_missing_colon(self):
        assert post("Basic !!!notbase64").status_code == 401
        no_colon = "Basic " + base64.b64encode(b"nocolonhere").decode()
        assert post(no_colon).status_code == 401

    def test_unconfigured_credentials_reject_everything(self):
        headers = {"authorization": basic(USER, PASS)}
        assert verify_kobotoolbox_request(headers, username="", password="") is False
        assert verify_kobotoolbox_request(headers, username=USER, password="") is False
        assert verify_kobotoolbox_request(headers, username=USER, password=PASS) is True

    def test_non_ascii_credentials_do_not_raise(self):
        headers = {"authorization": basic("üser", "pässwörd")}
        assert verify_kobotoolbox_request(headers, username="üser", password="pässwörd") is True
        assert verify_kobotoolbox_request(headers, username="user", password="pässwörd") is False


class TestBodyHandling:
    def test_json_submission(self, capsys):
        res = post(basic(USER, PASS))
        assert res.status_code == 200
        assert "New submission 1234" in capsys.readouterr().out

    def test_xml_submission(self, capsys):
        res = post(basic(USER, PASS), body=XML, content_type="application/xml")
        assert res.status_code == 200
        assert "xml/text" in capsys.readouterr().out

    def test_json_with_any_content_type(self):
        assert post(basic(USER, PASS), content_type="text/plain").status_code == 200

    def test_custom_wrapper(self):
        body = json.dumps({"source": "kobo", "data": SUBMISSION})
        assert post(basic(USER, PASS), body=body).status_code == 200

    def test_xml_without_credentials_is_401(self):
        assert post(body=XML, content_type="application/xml").status_code == 401


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
