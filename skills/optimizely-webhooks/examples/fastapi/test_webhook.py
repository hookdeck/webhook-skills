import hashlib
import hmac
import os

SECRET = "yIRFMTpsBcAKKRjJPCIykNo6EkNxJn_nq01-_r3S8i4"
os.environ["OPTIMIZELY_WEBHOOK_SECRET"] = SECRET

import json  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from main import app, verify_optimizely_signature  # noqa: E402

client = TestClient(app)

# Published test vector from Optimizely's docs (exact body bytes)
VECTOR_BODY = (
    '{"timestamp": 1558138293, "project_id": 11387641093, "data": {"cdn_url": '
    '"https://cdn.optimizely.com/datafiles/QMVJcUKEJZFg8pQ2jhAybK.json", "environment": '
    '"Production", "origin_url": '
    '"https://optimizely.s3.amazonaws.com/datafiles/QMVJcUKEJZFg8pQ2jhAybK.json", '
    '"revision": 13}, "event": "project.datafile_updated"}'
).encode()
VECTOR_HEADER = "sha1=b2493723c6ea6973fbda41573222c8ecb1c82666"


def sign(body: bytes, secret: str = SECRET) -> str:
    """Sign like Optimizely: sha1= + hex(HMAC-SHA1(secret, raw body))."""
    return "sha1=" + hmac.new(secret.encode(), body, hashlib.sha1).hexdigest()


# Documented sample payload
DATAFILE_PAYLOAD = json.dumps({
    "project_id": 1234,
    "timestamp": 1468447113,
    "event": "project.datafile_updated",
    "data": {
        "revision": 1,
        "origin_url": "https://optimizely.s3.amazonaws.com/json/1234.json",
        "cdn_url": "https://cdn.optimizely.com/json/1234.json",
        "environment": "Production",
    },
}).encode()

# Illustrative change-history payload (data is an array of change records)
RULESET_PAYLOAD = json.dumps({
    "project_id": 1234,
    "timestamp": 1468447200,
    "event": "project.ruleset_updated",
    "data": [{"change_type": "update", "entity": {"type": "ruleset"}}],
}).encode()


def post(body: bytes, signature=None):
    headers = {"Content-Type": "application/json"}
    if signature:
        headers["X-Hub-Signature"] = signature
    return client.post("/webhooks/optimizely", content=body, headers=headers)


class TestVerify:
    def test_published_test_vector(self):
        assert verify_optimizely_signature(VECTOR_BODY, VECTOR_HEADER, SECRET)

    def test_bare_and_uppercase_digest(self):
        assert verify_optimizely_signature(VECTOR_BODY, VECTOR_HEADER[5:], SECRET)
        assert verify_optimizely_signature(VECTOR_BODY, "sha1=" + VECTOR_HEADER[5:].upper(), SECRET)

    def test_rejects_bad_values(self):
        assert not verify_optimizely_signature(VECTOR_BODY + b" ", VECTOR_HEADER, SECRET)
        assert not verify_optimizely_signature(VECTOR_BODY, VECTOR_HEADER, "wrong")
        assert not verify_optimizely_signature(VECTOR_BODY, "sha1=abc", SECRET)
        assert not verify_optimizely_signature(VECTOR_BODY, "sha1=" + "zz" * 20, SECRET)
        assert not verify_optimizely_signature(VECTOR_BODY, "sha1=" + "é" * 40, SECRET)
        assert not verify_optimizely_signature(VECTOR_BODY, "", SECRET)
        assert not verify_optimizely_signature(VECTOR_BODY, None, SECRET)


class TestWebhook:
    def test_published_test_vector(self):
        assert post(VECTOR_BODY, VECTOR_HEADER).status_code == 200

    def test_datafile_updated(self):
        response = post(DATAFILE_PAYLOAD, sign(DATAFILE_PAYLOAD))
        assert response.status_code == 200
        assert response.json() == {"received": True}

    def test_ruleset_updated(self):
        assert post(RULESET_PAYLOAD, sign(RULESET_PAYLOAD)).status_code == 200

    def test_missing_signature(self):
        assert post(DATAFILE_PAYLOAD).status_code == 401

    def test_invalid_signature(self):
        assert post(DATAFILE_PAYLOAD, sign(DATAFILE_PAYLOAD, "other")).status_code == 401

    def test_malformed_signature(self):
        assert post(DATAFILE_PAYLOAD, "sha1=nothex").status_code == 401

    def test_invalid_json(self):
        assert post(b"not json", sign(b"not json")).status_code == 400

    def test_unknown_event(self):
        body = json.dumps({"event": "project.something_else", "data": {}}).encode()
        assert post(body, sign(body)).status_code == 200
