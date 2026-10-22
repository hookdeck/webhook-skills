import base64
import json
import os

# Set test environment variables before importing the app
AUTH = "Basic myCallbackKey#1"
os.environ["ONESPAN_AUTHORIZATION"] = AUTH

from fastapi.testclient import TestClient

from main import app, verify_onespan_request

client = TestClient(app)

# Shapes taken from OneSpan's documented callback payloads
PACKAGE_COMPLETE = {
    "@class": "com.silanis.esl.packages.event.ESLProcessEvent",
    "name": "PACKAGE_COMPLETE",
    "sessionUser": "e00696ec-d6f5-4feb-89c5-a5ce002a6c66",
    "packageId": "5n4obeO8jYoPp126Cm-Y3fxdfbo=",
    "message": None,
    "documentId": None,
    "createdDate": "2018-06-30T20:15:01.038Z",
}
DOCUMENT_SIGNED = {**PACKAGE_COMPLETE, "name": "DOCUMENT_SIGNED", "documentId": "default-consent"}
SIGNER_COMPLETE = {**PACKAGE_COMPLETE, "name": "SIGNER_COMPLETE"}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(PACKAGE_COMPLETE)
    return client.post(
        "/webhooks/onespan",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestOneSpanWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_key(self):
        assert post(headers={"Authorization": "Basic wrongKey"}).status_code == 401

    def test_rejects_key_without_prefix(self):
        assert post(headers={"Authorization": AUTH.replace("Basic ", "")}).status_code == 401

    def test_does_not_decode_key_as_http_basic(self):
        encoded = "Basic " + base64.b64encode(b"myCallbackKey#1").decode()
        assert post(headers={"Authorization": encoded}).status_code == 401

    def test_non_ascii_header_is_rejected_not_an_error(self):
        # compare_digest raises on non-ASCII str; the handler compares encoded bytes
        res = post(headers={"Authorization": "Basic café".encode("utf-8")})
        assert res.status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(DOCUMENT_SIGNED), {"Authorization": AUTH}, "text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": AUTH}).status_code == 400

    def test_json_array_returns_400(self):
        assert post("[1,2]", {"Authorization": AUTH}).status_code == 400

    def test_does_not_parse_body_before_authenticating(self):
        assert post("not json").status_code == 401

    def test_accepts_documented_and_unknown_events(self):
        for body in (DOCUMENT_SIGNED, SIGNER_COMPLETE, {**PACKAGE_COMPLETE, "name": "PACKAGE_DECLINE", "message": "reason"}):
            assert post(json.dumps(body), {"Authorization": AUTH}).status_code == 200
        assert post('{"name":"SOMETHING_NEW"}', {"Authorization": AUTH}).status_code == 200


class TestHelpers:
    def test_never_accepts_when_unconfigured(self):
        assert verify_onespan_request({"authorization": "Basic x"}, {}) is False
        assert verify_onespan_request({"authorization": ""}, {"ONESPAN_AUTHORIZATION": ""}) is False
