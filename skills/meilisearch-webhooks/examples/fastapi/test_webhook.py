import gzip
import json
import os

# Set test environment variables before importing the app
SECRET = "Bearer 9f2c7d1e4b8a4c36a1d05e7b3c9f8a21"
os.environ["MEILISEARCH_AUTHORIZATION"] = SECRET

from fastapi.testclient import TestClient

from main import app, parse_tasks, safe_equal, verify_meilisearch_request

client = TestClient(app)

# Task objects as returned by the Tasks API (trimmed)
TASKS = [
    {"uid": 1, "indexUid": "movies", "status": "succeeded", "type": "documentAdditionOrUpdate",
     "details": {"receivedDocuments": 10, "indexedDocuments": 10}},
    {"uid": 2, "indexUid": "movies", "status": "failed", "type": "settingsUpdate",
     "error": {"message": "Invalid settings", "code": "invalid_settings"}},
    {"uid": 3, "indexUid": "old", "status": "succeeded", "type": "indexDeletion",
     "details": {"deletedDocuments": 4}},
]
NDJSON = "".join(json.dumps(t) + "\n" for t in TASKS).encode()
GZ = gzip.compress(NDJSON)


def post(body=GZ, headers=None, content_type="application/x-ndjson", gzipped=True):
    h = {"Content-Type": content_type, **({"Content-Encoding": "gzip"} if gzipped else {})}
    h.update(headers or {})
    return client.post("/webhooks/meilisearch", content=body, headers=h)


class TestMeilisearchWebhook:
    def test_accepts_gzipped_multiline_body_with_full_authorization_value(self):
        res = post(headers={"Authorization": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True, "tasks": 3}

    def test_accepts_uncompressed_ndjson(self):
        res = post(NDJSON, {"Authorization": SECRET}, gzipped=False)
        assert res.status_code == 200
        assert res.json()["tasks"] == 3

    def test_rejects_missing_authorization(self):
        assert post().status_code == 401

    def test_rejects_wrong_secret(self):
        assert post(headers={"Authorization": "Bearer nope"}).status_code == 401

    def test_rejects_token_without_bearer_prefix(self):
        res = post(headers={"Authorization": SECRET.replace("Bearer ", "")})
        assert res.status_code == 401

    def test_checks_credential_before_decoding(self):
        res = post(b"not gzip", {"Authorization": "Bearer nope"})
        assert res.status_code == 401

    def test_non_gzip_body_claiming_gzip_returns_400(self):
        assert post(b"not gzip", {"Authorization": SECRET}).status_code == 400

    def test_invalid_ndjson_returns_400(self):
        bad = gzip.compress(b'{"uid":1}\nnot json\n')
        assert post(bad, {"Authorization": SECRET}).status_code == 400

    def test_line_that_is_not_an_object_returns_400(self):
        assert post(gzip.compress(b"[1,2]\n"), {"Authorization": SECRET}).status_code == 400

    def test_authenticates_regardless_of_content_type(self):
        res = post(headers={"Authorization": SECRET}, content_type="text/plain")
        assert res.status_code == 200


class TestHelpers:
    def test_parse_tasks_skips_blank_lines(self):
        assert len(parse_tasks(b'{"uid":1}\n\n{"uid":2}\r\n', "")) == 2

    def test_safe_equal_handles_non_ascii(self):
        assert safe_equal("Bearer é", "Bearer é") is True
        assert safe_equal("Bearer é", "Bearer e") is False

    def test_never_accepts_when_unconfigured(self):
        assert verify_meilisearch_request({"authorization": "Bearer x"}, {}) is False
        assert verify_meilisearch_request({"authorization": ""}, {"MEILISEARCH_AUTHORIZATION": ""}) is False
