import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

SECRET = "DuP4ej5yyJB5TIrIEI/dCtJN7sHj"  # plain string, used as-is (not decoded)
os.environ["RECRUITEE_WEBHOOK_SECRET"] = SECRET

from main import app, verify_recruitee_webhook  # noqa: E402

client = TestClient(app)

# Test vector published in the Recruitee docs
VECTOR_BODY = "{\"attempt_count\":1,\"created_at\":\"2020-12-14T04:47:33.905241Z\",\"event_subtype\":\"stage_changed\",\"event_type\":\"candidate_moved\",\"id\":30,\"payload\":{\"candidate\":{\"created_at\":\"2020-12-09T14:36:56.578000Z\",\"emails\":[],\"id\":975539,\"name\":\"test\",\"phones\":[],\"photo_thumb_url\":\"https://recruitee-staging.s3.eu-central-1.amazonaws.com/candidates/975539/thumb_photo_anydaa715ph6.png\",\"referrer\":null,\"source\":\"manual\",\"updated_at\":\"2020-12-09T14:37:01.119831Z\"},\"company\":{\"id\":5943,\"name\":\"MP company 2\"},\"details\":{\"from_stage\":{\"id\":911876,\"name\":\"Phone interview\"},\"to_stage\":{\"id\":911877,\"name\":\"On-site interview\"}},\"offer\":{\"created_at\":\"2020-12-09T14:37:59.875608Z\",\"department\":null,\"id\":269122,\"kind\":\"job\",\"slug\":\"test-job\",\"tags\":[],\"title\":\"test job\",\"updated_at\":\"2020-12-09T14:38:17.539041Z\"}}}"
VECTOR_SIGNATURE = "3b64e3049cb9e108fbb18a453e909cb4a32e3ae140ea01d84c2b5d316c19162f"


def sign(body: str, secret: str = SECRET) -> str:
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


def event(**overrides) -> str:
    data = {
        "id": 1,
        "attempt_count": 1,
        "created_at": "2020-12-11T23:50:56.168592Z",
        "event_type": "new_candidate",
        "event_subtype": "manual",
        "payload": {"candidate": {"id": 21056, "name": "John Doe"}, "company": {"id": 1, "name": "Devtest Company"}},
    }
    data.update(overrides)
    return json.dumps(data)


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["X-Recruitee-Signature"] = signature
    return client.post("/webhooks/recruitee", content=body, headers=headers)


class TestVerify:
    def test_matches_docs_test_vector(self):
        assert sign(VECTOR_BODY) == VECTOR_SIGNATURE
        assert verify_recruitee_webhook(VECTOR_BODY.encode(), VECTOR_SIGNATURE, SECRET)

    def test_rejects_missing_and_malformed(self):
        body = VECTOR_BODY.encode()
        assert not verify_recruitee_webhook(body, None, SECRET)
        assert not verify_recruitee_webhook(body, "not-hex", SECRET)
        assert not verify_recruitee_webhook(body, "abcd", SECRET)


class TestWebhook:
    def test_accepts_docs_test_vector(self):
        assert post(VECTOR_BODY, VECTOR_SIGNATURE).status_code == 200

    @pytest.mark.parametrize("event_type,event_subtype", [
        ("new_candidate", "career_site"),
        ("candidate_assigned", "manual"),
        ("candidate_moved", "stage_changed"),
        ("candidate_moved", "disqualified"),
        ("candidate_moved", "requalified"),
        ("candidate_deleted", "manual"),
        ("offer_published", "manual"),
        ("offer_unpublished", "manual"),
        ("offer_updated", "tags_changed"),
        ("something_new", "manual"),
    ])
    def test_accepts_valid_signature_for_each_event(self, event_type, event_subtype):
        body = event(event_type=event_type, event_subtype=event_subtype)
        assert post(body, sign(body)).status_code == 200

    def test_verifies_regardless_of_content_type(self):
        body = event()
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_rejects_invalid_signature(self):
        assert post(event(), "a" * 64).status_code == 400

    def test_rejects_wrong_secret(self):
        body = event()
        assert post(body, sign(body, "other-secret")).status_code == 400

    def test_rejects_tampered_body(self):
        assert post(event(id=2), sign(event())).status_code == 400

    def test_rejects_missing_signature_on_real_event(self):
        assert post(event()).status_code == 400

    def test_test_request_returns_200_signed_or_not(self):
        body = '{"test":true}'
        assert post(body).status_code == 200
        assert post(body, sign(body)).status_code == 200

    def test_rejects_unsigned_body_that_looks_like_event(self):
        assert post(json.dumps({"test": True, "event_type": "new_candidate"})).status_code == 400

    def test_rejects_invalid_json_with_valid_signature(self):
        body = "not json"
        assert post(body, sign(body), "text/plain").status_code == 400
