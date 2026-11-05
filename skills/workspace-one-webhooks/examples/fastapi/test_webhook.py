import base64
import os

# Set test environment variables before importing the app
os.environ["WORKSPACE_ONE_WEBHOOK_USERNAME"] = "ws1-notify"
os.environ["WORKSPACE_ONE_WEBHOOK_PASSWORD"] = "p@ss:word-with-colon"

from fastapi.testclient import TestClient

from main import app, verify_workspace_one_request

client = TestClient(app)

USER = os.environ["WORKSPACE_ONE_WEBHOOK_USERNAME"]
PASS = os.environ["WORKSPACE_ONE_WEBHOOK_PASSWORD"]

def basic(user, password, scheme="Basic"):
    return f"{scheme} " + base64.b64encode(f"{user}:{password}".encode("utf-8")).decode()


# Placeholder body: Omnissa's page does not document the payload.
BODY = '{"placeholder":"not a Workspace ONE payload"}'


def post(auth=None, body=None, content_type="application/json"):
    content = body if body is not None else BODY
    headers = {"Content-Type": content_type}
    if auth is not None:
        headers["Authorization"] = auth
    return client.post("/webhooks/workspace-one", content=content, headers=headers)


class TestBasicAuthVerification:
    def test_accepts_correct_credentials(self):
        res = post(basic(USER, PASS))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_case_insensitive_scheme_and_splits_on_first_colon(self):
        assert post(basic(USER, PASS, scheme="bAsIc")).status_code == 200

    def test_rejects_wrong_password(self):
        assert post(basic(USER, "wrong")).status_code == 401

    def test_rejects_wrong_username(self):
        assert post(basic("someone-else", PASS)).status_code == 401

    def test_rejects_password_truncated_at_first_colon(self):
        assert post(basic(USER, PASS.split(":")[0])).status_code == 401

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_non_basic_scheme(self):
        assert post(f"Bearer {PASS}").status_code == 401

    def test_rejects_malformed_base64_and_missing_colon(self):
        assert post("Basic !!!not-base64!!!").status_code == 401
        no_colon = "Basic " + base64.b64encode(b"justausername").decode()
        assert post(no_colon).status_code == 401

    def test_non_ascii_credentials_do_not_raise(self):
        assert post(basic("usér", "pässwörd")).status_code == 401

    def test_rejects_when_unconfigured(self):
        headers = {"authorization": basic(USER, PASS)}
        assert verify_workspace_one_request(headers, "", "") is False
        assert verify_workspace_one_request({"authorization": basic("", "")}, "", "") is False


class TestBodyHandling:
    def test_accepts_json_body(self):
        assert post(basic(USER, PASS)).status_code == 200

    def test_accepts_xml_body(self):
        assert post(basic(USER, PASS), "<placeholder/>", "application/xml").status_code == 200

    def test_accepts_any_content_type(self):
        assert post(basic(USER, PASS), BODY, "text/plain").status_code == 200

    def test_stores_unparseable_body_rather_than_rejecting(self):
        assert post(basic(USER, PASS), "{not json").status_code == 200

    def test_unauthenticated_body_is_401(self):
        assert post(None, "{not json").status_code == 401
