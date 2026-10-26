import base64
import json
import os

# Set test environment variables before importing the app
os.environ["SAP_SUCCESSFACTORS_WEBHOOK_USERNAME"] = "sf_integration"
os.environ["SAP_SUCCESSFACTORS_WEBHOOK_PASSWORD"] = "p@ss:word-with-colon"

from fastapi.testclient import TestClient

from main import app, parse_basic_auth, verify_sap_successfactors_request

client = TestClient(app)

USER = os.environ["SAP_SUCCESSFACTORS_WEBHOOK_USERNAME"]
PASS = os.environ["SAP_SUCCESSFACTORS_WEBHOOK_PASSWORD"]

# Illustrative payload: SAP SuccessFactors sends whatever fields the integration maps.
JSON_BODY = json.dumps({"userId": "example-1001", "firstName": "Ada", "department": "Engineering"})
XML_BODY = "<Employee><userId>example-1001</userId></Employee>"


def basic(user=USER, password=PASS, scheme="Basic"):
    return f"{scheme} {base64.b64encode(f'{user}:{password}'.encode()).decode()}"


def post(auth=None, body=JSON_BODY, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if auth:
        headers["Authorization"] = auth
    return client.post("/webhooks/sap-successfactors", content=body, headers=headers)


class TestBasicAuth:
    def test_accepts_correct_credentials(self):
        res = post(basic())
        assert res.status_code == 200
        assert res.json() == {"received": True, "format": "json"}

    def test_scheme_is_case_insensitive(self):
        assert post(basic(scheme="basic")).status_code == 200
        assert post(basic(scheme="BASIC")).status_code == 200

    def test_splits_on_first_colon(self):
        assert parse_basic_auth(basic("a", "b:c:d")) == (b"a", b"b:c:d")

    def test_rejects_wrong_password_username_or_both(self):
        assert post(basic(USER, "wrong")).status_code == 401
        assert post(basic("someone", PASS)).status_code == 401
        assert post(basic("x", "y")).status_code == 401

    def test_rejects_missing_header_and_other_schemes(self):
        assert post().status_code == 401
        assert post(f"Bearer {PASS}").status_code == 401

    def test_rejects_credentials_followed_by_junk(self):
        assert post(basic() + "!!").status_code == 401
        assert post(basic() + " extra").status_code == 401

    def test_rejects_non_base64_and_missing_colon(self):
        assert post("Basic not*base64").status_code == 401
        assert post("Basic " + base64.b64encode(b"nocolon").decode()).status_code == 401

    def test_rejects_when_unconfigured(self):
        assert verify_sap_successfactors_request({"authorization": basic()}, "", "") is False

    def test_does_not_raise_on_non_ascii_credentials(self):
        assert post(basic("üser", "pässword")).status_code == 401
        assert verify_sap_successfactors_request({"authorization": basic("üser", "pässword")}, "üser", "pässword")


class TestMethodsAndBodies:
    def test_accepts_get_without_body(self):
        res = client.get("/webhooks/sap-successfactors", headers={"Authorization": basic()})
        assert res.status_code == 200
        assert res.json() == {"received": True, "format": "empty"}

    def test_rejects_unauthenticated_get(self):
        assert client.get("/webhooks/sap-successfactors").status_code == 401

    def test_rejects_other_methods(self):
        res = client.put("/webhooks/sap-successfactors", headers={"Authorization": basic()})
        assert res.status_code == 405

    def test_accepts_empty_post_body(self):
        res = post(basic(), body="")
        assert res.status_code == 200
        assert res.json()["format"] == "empty"

    def test_keeps_xml_as_text(self):
        res = post(basic(), body=XML_BODY, content_type="application/xml")
        assert res.json()["format"] == "xml"

    def test_accepts_plus_json_and_unknown_content_types(self):
        assert post(basic(), content_type="application/vnd.sap+json").json()["format"] == "json"
        assert post(basic(), body="a,b,c", content_type="text/csv").json()["format"] == "text"

    def test_malformed_json_is_400(self):
        assert post(basic(), body="{oops").status_code == 400

    def test_authenticates_before_parsing(self):
        assert post(basic(USER, "wrong"), body="{oops").status_code == 401


def test_health():
    assert client.get("/health").status_code == 200
