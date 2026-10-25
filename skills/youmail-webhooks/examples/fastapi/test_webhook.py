import json
import os

# Set test environment variables before importing the app
AUTH = "Bearer 1b2c3d4e-5f60-4718-9a0b-c1d2e3f40516"
os.environ["YOUMAIL_AUTHORIZATION"] = AUTH

from fastapi.testclient import TestClient

from main import app, classify, verify_youmail_request

client = TestClient(app)

# Shapes taken from the payload schemas in YouMail's OpenAPI spec (trimmed)
CALL_EVENTS = {"callEvents": [{"callEventUuid": "a1b2c3", "callResult": "BLOCKED"}]}
PHONE_INSIGHTS = {"callVolumeSummaries": [{"callingPhoneNumber": "+15555550100", "destinationCarriers": []}]}
TN_REPORT = {
    "tnReportUuid": "f0e1d2",
    "phoneNumber": "+15555550100",
    "status": "MITIGATED",
    "statusChangeTime": 1760000000000,
}
SCORE_THRESHOLD = {
    "phoneNumber": "+15555550100",
    "oldSpamScore": 0.4,
    "newSpamScore": 0.9,
    "createdDate": "2026-10-25T12:00:00Z",
}


def post(body=None, headers=None, content_type="application/json"):
    content = body if body is not None else json.dumps(CALL_EVENTS)
    return client.post(
        "/webhooks/youmail",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestYouMailWebhook:
    def test_accepts_full_authorization_header(self):
        res = post(headers={"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_rejects_missing_header(self):
        assert post().status_code == 401

    def test_rejects_wrong_token(self):
        res = post(headers={"Authorization": "Bearer 00000000-0000-0000-0000-000000000000"})
        assert res.status_code == 401

    def test_rejects_token_without_prefix(self):
        res = post(headers={"Authorization": AUTH.replace("Bearer ", "")})
        assert res.status_code == 401

    def test_rejects_basic_credential(self):
        assert post(headers={"Authorization": "Basic dXNlcjpwYXNz"}).status_code == 401

    def test_non_ascii_header_does_not_raise(self):
        # compare_digest on str would raise TypeError for non-ASCII; bytes never do
        assert verify_youmail_request({"authorization": "Bearer café"}, {"YOUMAIL_AUTHORIZATION": AUTH}) is False

    def test_authenticates_regardless_of_content_type(self):
        res = post(json.dumps(TN_REPORT), {"Authorization": AUTH}, "text/plain")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": AUTH}).status_code == 400

    def test_json_array_returns_400(self):
        assert post("[1,2]", {"Authorization": AUTH}).status_code == 400

    def test_accepts_every_documented_shape(self):
        for body in (CALL_EVENTS, PHONE_INSIGHTS, TN_REPORT, SCORE_THRESHOLD):
            assert post(json.dumps(body), {"Authorization": AUTH}).status_code == 200


class TestHelpers:
    def test_classify(self):
        assert classify(CALL_EVENTS) == "CALL_EVENT"
        assert classify(PHONE_INSIGHTS) == "PHONE_INSIGHTS"
        assert classify(TN_REPORT) == "PROVIDER_TN_REPORT_STATUS"
        assert classify(SCORE_THRESHOLD) == "WATCHLIST_SCORE_THRESHOLD"
        assert classify({"foo": 1}) is None

    def test_never_accepts_when_unconfigured(self):
        assert verify_youmail_request({"authorization": "Bearer x"}, {}) is False
        assert verify_youmail_request({"authorization": ""}, {"YOUMAIL_AUTHORIZATION": ""}) is False
