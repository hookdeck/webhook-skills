import json
import os

# Set test environment variables before importing the app
NAME = "Authorization"
VALUE = "Bearer test_speechmatics_token_0123456789"
os.environ["SPEECHMATICS_WEBHOOK_HEADER"] = NAME
os.environ["SPEECHMATICS_WEBHOOK_SECRET"] = VALUE

from fastapi.testclient import TestClient

from main import app, verify_speechmatics_request

client = TestClient(app)

JOB_ID = "r6sr3jlzjj"

# A jobinfo body: the JSON Speechmatics sends when only `jobinfo` is requested
JOBINFO = json.dumps({"id": JOB_ID, "type": "transcription", "created_at": "2021-07-19T09:02:17.283Z"})


def send(method="POST", headers=None, body=JOBINFO, content_type="application/json", status="success"):
    h = dict(headers or {})
    if content_type:
        h["content-type"] = content_type
    return client.request(
        method,
        f"/webhooks/speechmatics?id={JOB_ID}&status={status}",
        content=body,
        headers=h,
    )


class TestAuthHeader:
    def test_accepts_correct_whole_value(self):
        res = send(headers={NAME: VALUE})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert send(headers={NAME.lower(): VALUE}).status_code == 200

    def test_compares_whole_value_without_bearer_prefix(self):
        assert send(headers={NAME: VALUE.replace("Bearer ", "")}).status_code == 401

    def test_rejects_wrong_value_same_length(self):
        assert send(headers={NAME: "x" * len(VALUE)}).status_code == 401

    def test_rejects_value_of_different_length(self):
        assert send(headers={NAME: "short"}).status_code == 401

    def test_rejects_missing_header(self):
        assert send().status_code == 401

    def test_rejects_value_under_different_header_name(self):
        assert send(headers={"X-Other-Header": VALUE}).status_code == 401

    def test_rejects_unauthenticated_empty_request(self):
        assert send(body=None, content_type=None).status_code == 401


class TestMethodsAndBodies:
    def test_accepts_put_as_well_as_post(self):
        assert send("PUT", headers={NAME: VALUE}).status_code == 200

    def test_accepts_empty_body(self):
        assert send(headers={NAME: VALUE}, body=None, content_type=None).status_code == 200

    def test_accepts_plain_text_transcript(self):
        res = send(headers={NAME: VALUE}, body="1\n00:00:00,000 --> 00:00:01,000\nHello\n", content_type="text/plain")
        assert res.status_code == 200

    def test_accepts_multipart_body_without_parsing(self):
        boundary = "xBOUNDARYx"
        body = (
            f'--{boundary}\r\nContent-Disposition: form-data; name="jobinfo"\r\nContent-Type: application/json\r\n\r\n{JOBINFO}\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="data_file"; filename="a.wav"\r\nContent-Type: audio/wav\r\n\r\nRIFF\r\n'
            f"--{boundary}--\r\n"
        )
        res = send(headers={NAME: VALUE}, body=body, content_type=f"multipart/form-data; boundary={boundary}")
        assert res.status_code == 200

    def test_invalid_json_returns_400(self):
        assert send(headers={NAME: VALUE}, body="{not json").status_code == 400

    def test_other_methods_return_405(self):
        assert send("GET", headers={NAME: VALUE}, body=None, content_type=None).status_code == 405


class TestStatuses:
    def test_handles_success_error_fetch_error_trim_error_and_unknown(self):
        for status in ["success", "error", "fetch_error", "trim_error", "something_new"]:
            assert send(headers={NAME: VALUE}, status=status).status_code == 200


class TestVerifySpeechmaticsRequest:
    def test_rejects_everything_when_no_secret_configured(self):
        assert verify_speechmatics_request({"authorization": "abc"}, {}) is False
        assert verify_speechmatics_request({"authorization": ""}, {"SPEECHMATICS_WEBHOOK_SECRET": ""}) is False

    def test_defaults_header_name_to_authorization(self):
        config = {"SPEECHMATICS_WEBHOOK_SECRET": "Bearer s3cret"}
        assert verify_speechmatics_request({"authorization": "Bearer s3cret"}, config) is True

    def test_uses_custom_header_name(self):
        config = {"SPEECHMATICS_WEBHOOK_HEADER": "X-SM-Token", "SPEECHMATICS_WEBHOOK_SECRET": "s3cret"}
        assert verify_speechmatics_request({"x-sm-token": "s3cret"}, config) is True
        assert verify_speechmatics_request({"authorization": "s3cret"}, config) is False

    def test_non_ascii_header_value_does_not_raise(self):
        config = {"SPEECHMATICS_WEBHOOK_SECRET": "s3cret"}
        assert verify_speechmatics_request({"authorization": "sécret"}, config) is False


class TestHealth:
    def test_health(self):
        res = client.get("/health")
        assert res.status_code == 200
        assert res.json() == {"status": "ok"}
