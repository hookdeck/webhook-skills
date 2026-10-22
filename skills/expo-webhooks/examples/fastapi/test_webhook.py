import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Expo secrets are any string of at least 16 characters you pass to `eas webhook:create`
os.environ["EXPO_WEBHOOK_SECRET"] = "test_expo_webhook_secret"

from main import app, classify_payload, verify_expo_signature  # noqa: E402

client = TestClient(app)
SECRET = os.environ["EXPO_WEBHOOK_SECRET"]


def sign(body: str, secret: str = SECRET) -> str:
    """Sign like EAS: "sha1=" + hex(HMAC-SHA1(secret, raw body))."""
    return "sha1=" + hmac.new(secret.encode("utf-8"), body.encode("utf-8"), hashlib.sha1).hexdigest()


BUILD = {
    "id": "147a3212-49fd-446f-b4e3-a6519acf264a",
    "accountName": "dsokal",
    "projectName": "example",
    "buildDetailsPageUrl": "https://expo.dev/accounts/dsokal/projects/example/builds/147a3212-49fd-446f-b4e3-a6519acf264a",
    "platform": "android",
    "status": "finished",
    "artifacts": {"buildUrl": "https://expo.dev/artifacts/eas/wyodu9tua2ZuKKiaJ1Nbkn.aab"},
    "metadata": {"appVersion": "1.0.2", "buildProfile": "production"},
}

SUBMIT = {
    "id": "0374430d-7776-44ad-be7d-8513629adc54",
    "accountName": "dsokal",
    "projectName": "example",
    "submissionDetailsPageUrl": "https://expo.dev/accounts/dsokal/projects/example/builds/0374430d-7776-44ad-be7d-8513629adc54",
    "archiveUrl": "http://archive.url/abc.apk",
    "platform": "android",
    "status": "errored",
    "submissionInfo": {
        "error": {
            "message": "Android version code needs to be updated",
            "errorCode": "SUBMISSION_SERVICE_ANDROID_OLD_VERSION_CODE_ERROR",
        }
    },
}


def post(body: str, signature=None, content_type="application/json"):
    headers = {"Content-Type": content_type}
    if signature:
        headers["expo-signature"] = signature
    return client.post("/webhooks/expo", content=body, headers=headers)


class TestVerifyExpoSignature:
    def test_accepts_valid_signature(self):
        body = json.dumps(BUILD)
        assert verify_expo_signature(body.encode(), sign(body), SECRET)

    def test_uses_sha1_prefix_with_40_char_hex(self):
        sig = sign("{}")
        assert sig.startswith("sha1=") and len(sig) == 45

    def test_rejects_signature_without_prefix(self):
        body = json.dumps(BUILD)
        assert not verify_expo_signature(body.encode(), sign(body)[5:], SECRET)

    def test_rejects_tampered_body(self):
        body = json.dumps(BUILD)
        tampered = body.replace("finished", "errored")
        assert not verify_expo_signature(tampered.encode(), sign(body), SECRET)

    def test_rejects_wrong_secret(self):
        body = json.dumps(BUILD)
        assert not verify_expo_signature(body.encode(), sign(body, "another_secret_value"), SECRET)

    def test_rejects_missing_signature_or_secret(self):
        body = json.dumps(BUILD).encode()
        assert not verify_expo_signature(body, None, SECRET)
        assert not verify_expo_signature(body, sign(body.decode()), None)


class TestClassifyPayload:
    def test_identifies_build_and_submit(self):
        assert classify_payload(BUILD) == "BUILD"
        assert classify_payload(SUBMIT) == "SUBMIT"
        assert classify_payload({"id": "x"}) == "UNKNOWN"


class TestWebhookEndpoint:
    def test_missing_signature_returns_400(self):
        res = post(json.dumps(BUILD))
        assert res.status_code == 400
        assert res.json()["detail"] == "Missing expo-signature header"

    def test_invalid_signature_returns_400(self):
        res = post(json.dumps(BUILD), "sha1=" + "a" * 40)
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid signature"

    def test_malformed_signature_returns_400(self):
        assert post(json.dumps(BUILD), "not-a-signature").status_code == 400

    @pytest.mark.parametrize("status", ["finished", "errored", "canceled"])
    def test_accepts_signed_build(self, status):
        body = json.dumps({**BUILD, "status": status})
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True, "type": "BUILD"}

    @pytest.mark.parametrize("status", ["finished", "errored", "canceled"])
    def test_accepts_signed_submission(self, status):
        body = json.dumps({**SUBMIT, "status": status})
        res = post(body, sign(body))
        assert res.status_code == 200
        assert res.json() == {"received": True, "type": "SUBMIT"}

    def test_verifies_regardless_of_content_type(self):
        body = json.dumps(BUILD)
        assert post(body, sign(body), "text/plain").status_code == 200

    def test_signed_non_json_returns_400(self):
        res = post("not json", sign("not json"), "text/plain")
        assert res.status_code == 400
        assert res.json()["detail"] == "Invalid JSON"

    def test_missing_secret_returns_500(self, monkeypatch):
        body = json.dumps(BUILD)
        signature = sign(body)
        monkeypatch.delenv("EXPO_WEBHOOK_SECRET")
        assert post(body, signature).status_code == 500


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
