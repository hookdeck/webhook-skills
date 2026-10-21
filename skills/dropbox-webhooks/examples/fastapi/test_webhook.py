import hashlib
import hmac
import json
import os

os.environ["DROPBOX_APP_SECRET"] = "test_app_secret_abc123"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)
APP_SECRET = os.environ["DROPBOX_APP_SECRET"]

payload = json.dumps(
    {
        "list_folder": {"accounts": ["dbid:AAH4f99T0taONIb-OurWxbNQ6ywGRopQngc"]},
        "delta": {"users": [12345678]},
    }
)


def sign(body: str, secret: str = APP_SECRET) -> str:
    # Dropbox signature: hex HMAC-SHA256 of the raw body keyed with the app secret
    return hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()


def post(body: str, signature=None):
    headers = {"Content-Type": "application/json"}
    if signature is not None:
        headers["X-Dropbox-Signature"] = signature
    return client.post("/webhooks/dropbox", content=body, headers=headers)


class TestChallenge:
    def test_echoes_challenge_as_text_plain_with_nosniff(self):
        res = client.get("/webhooks/dropbox", params={"challenge": "abc123"})
        assert res.status_code == 200
        assert res.text == "abc123"
        assert res.headers["content-type"].startswith("text/plain")
        assert res.headers["x-content-type-options"] == "nosniff"

    def test_rejects_missing_challenge(self):
        assert client.get("/webhooks/dropbox").status_code == 400


class TestNotification:
    def test_accepts_valid_signature(self):
        assert post(payload, sign(payload)).status_code == 200

    def test_rejects_invalid_signature(self):
        assert post(payload, sign(payload, "wrong_secret")).status_code == 400

    def test_rejects_missing_signature(self):
        assert post(payload).status_code == 400

    def test_rejects_wrong_length_signature(self):
        assert post(payload, "abc").status_code == 400

    def test_rejects_modified_body(self):
        modified = payload.replace("dbid:AAH4", "dbid:BBH4")
        assert post(modified, sign(payload)).status_code == 400

    def test_rejects_signed_invalid_json(self):
        assert post("not json", sign("not json")).status_code == 400
