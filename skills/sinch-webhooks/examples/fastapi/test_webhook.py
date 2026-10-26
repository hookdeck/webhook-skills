import base64
import hashlib
import hmac
import json
import os
import time

import pytest

# Set the webhook secret before importing the app.
# Sinch webhook secrets are opaque strings used as-is (UTF-8) as the HMAC key.
os.environ["SINCH_WEBHOOK_SECRET"] = "test_sinch_webhook_secret"

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402

client = TestClient(app)
WEBHOOK_SECRET = os.environ["SINCH_WEBHOOK_SECRET"]
NONCE = "01FJA8B4A7BM43YGWSG9GBV067"


def sign(payload: bytes, secret: str, nonce: str, timestamp: str) -> str:
    """Sign like Sinch: base64(HMAC-SHA256(secret, body + "." + nonce + "." + timestamp))."""
    signed = payload + b"." + nonce.encode("latin-1") + b"." + timestamp.encode("latin-1")
    return base64.b64encode(hmac.new(secret.encode(), signed, hashlib.sha256).digest()).decode()


def signed_headers(payload: bytes, secret: str = WEBHOOK_SECRET, nonce: str = NONCE, timestamp: int | None = None):
    ts = str(timestamp if timestamp is not None else int(time.time()))
    return {
        "content-type": "application/json",
        "x-sinch-webhook-signature": sign(payload, secret, nonce, ts),
        "x-sinch-webhook-signature-nonce": nonce,
        "x-sinch-webhook-signature-timestamp": ts,
    }


PAYLOADS = {
    "message": {
        "app_id": "01EB37HMH1M6SV18ABNS3G135H",
        "accepted_time": "2020-11-16T08:17:44.993024Z",
        "event_time": "2020-11-16T08:17:42.814Z",
        "project_id": "c36f3d3d-1523-4edd-ae42-11995557ff61",
        "message": {
            "id": "01EQ8235TD19N21XQTH12B145D",
            "direction": "TO_APP",
            "contact_message": {"text_message": {"text": "Hi!"}},
            "channel_identity": {"channel": "MESSENGER", "identity": "2742085512340733", "app_id": "01EB37HMH1M6SV18ABNS3G135H"},
            "conversation_id": "01EQ8172WMDB8008EFT4M30481",
            "contact_id": "01EQ4174TGGY5B1VPTPGHW19R0",
        },
        "correlation_id": "correlation-id-1",
    },
    "message_delivery_report": {
        "app_id": "01EB37HMH1M6SV18BSNS3G135H",
        "accepted_time": "2020-11-17T15:09:11.659Z",
        "event_time": "2020-11-17T15:09:13.267185Z",
        "project_id": "c36f3d3d-1513-2edd-ae42-11995557ff61",
        "message_delivery_report": {
            "message_id": "01EQBC1A3BEK731GY4YXEN0C2R",
            "conversation_id": "01EPYATA64TMNZ1FV02JKF12JF",
            "status": "QUEUED_ON_CHANNEL",
            "channel_identity": {"channel": "MESSENGER", "identity": "2734085512340733", "app_id": "01EB27HMH1M6SV18ASNS3G135H"},
        },
    },
    "contact_create_notification": {
        "app_id": "",
        "accepted_time": "2020-11-17T15:36:28.155494Z",
        "project_id": "c36f3a3d-1513-4edd-ae42-11995557ff61",
        "contact_create_notification": {
            "contact": {
                "id": "01EQBDK8771J6A1FV8MQPE1XAR",
                "channel_identities": [{"channel": "VIBER", "identity": "9KC0p+pi4zPGFO99ACDxdQ==", "app_id": "01EB37KMH1M6SV18ASNS3G135H"}],
                "display_name": "Unknown",
            }
        },
    },
}


def post(body: bytes, headers: dict):
    return client.post("/webhooks/sinch", content=body, headers=headers)


class TestPublishedVector:
    # Worked example from Sinch's docs
    SECRET = "foo_secret1234"
    BODY = "{\"app_id\":\"\",\"accepted_time\":\"2021-10-18T17:49:13.813615Z\",\"project_id\":\"e2df3a34-a71b-4448-9db5-a8d2baad28e4\",\"contact_create_notification\":{\"contact\":{\"id\":\"01FJA8B466Y0R2GNXD78MD9SM1\",\"channel_identities\":[{\"channel\":\"SMS\",\"identity\":\"48123456789\",\"app_id\":\"\"}],\"display_name\":\"New Test Contact\",\"email\":\"new.contact@email.com\",\"external_id\":\"\",\"metadata\":\"\",\"language\":\"EN_US\"}},\"message_metadata\":\"\"}".encode()
    HEADERS = {
        "content-type": "application/json",
        "x-sinch-webhook-signature-nonce": "01FJA8B4A7BM43YGWSG9GBV067",
        "x-sinch-webhook-signature-timestamp": "1634579353",
        "x-sinch-webhook-signature": "6bpJoRmFoXVjfJIVglMoJzYXxnoxRujzR4k2GOXewOE=",
    }

    def test_computes_documented_signature(self):
        assert (
            sign(self.BODY, self.SECRET, self.HEADERS["x-sinch-webhook-signature-nonce"], self.HEADERS["x-sinch-webhook-signature-timestamp"])
            == "6bpJoRmFoXVjfJIVglMoJzYXxnoxRujzR4k2GOXewOE="
        )

    def test_accepts_documented_request(self, monkeypatch):
        monkeypatch.setenv("SINCH_WEBHOOK_SECRET", self.SECRET)
        assert post(self.BODY, self.HEADERS).status_code == 200


class TestValidCallbacks:
    @pytest.mark.parametrize("name", list(PAYLOADS))
    def test_accepts_signed_callback(self, name):
        body = json.dumps(PAYLOADS[name]).encode()
        assert post(body, signed_headers(body)).status_code == 200

    def test_verifies_exact_bytes_whatever_content_type(self):
        body = json.dumps(PAYLOADS["message"]).encode()
        headers = {**signed_headers(body), "content-type": "text/plain"}
        assert post(body, headers).status_code == 200

    def test_accepts_unrecognised_callback_once_signed(self):
        body = json.dumps({"project_id": "p", "something_new": {}}).encode()
        assert post(body, signed_headers(body)).status_code == 200


class TestInvalidRequests:
    BODY = json.dumps(PAYLOADS["message"]).encode()

    def test_wrong_secret(self):
        assert post(self.BODY, signed_headers(self.BODY, secret="other")).status_code == 401

    def test_tampered_body(self):
        assert post(self.BODY + b" ", signed_headers(self.BODY)).status_code == 401

    def test_non_canonical_base64(self):
        headers = signed_headers(self.BODY)
        sig = headers["x-sinch-webhook-signature"]
        alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        # A stray low bit in the last character decodes to the same bytes, but is not the signature sent
        headers["x-sinch-webhook-signature"] = sig[:42] + alphabet[alphabet.index(sig[42]) | 1] + "="
        assert post(self.BODY, headers).status_code == 401

    def test_changed_nonce(self):
        headers = {**signed_headers(self.BODY), "x-sinch-webhook-signature-nonce": "OTHERNONCE"}
        assert post(self.BODY, headers).status_code == 401

    def test_changed_timestamp(self):
        headers = {**signed_headers(self.BODY), "x-sinch-webhook-signature-timestamp": "1"}
        assert post(self.BODY, headers).status_code == 401

    @pytest.mark.parametrize(
        "header",
        ["x-sinch-webhook-signature", "x-sinch-webhook-signature-nonce", "x-sinch-webhook-signature-timestamp"],
    )
    def test_missing_header(self, header):
        headers = signed_headers(self.BODY)
        del headers[header]
        assert post(self.BODY, headers).status_code == 401

    def test_malformed_signatures(self):
        good = signed_headers(self.BODY)
        sig = good["x-sinch-webhook-signature"]
        flipped = next(i for i, c in enumerate(sig) if c.isalpha())
        malformed = [
            sig[:-1],  # too short
            sig + "A",  # too long
            sig[:42] + "-=",  # bad alphabet
            sig[:-1] + "$",  # bad char
            sig[:flipped] + sig[flipped].swapcase() + sig[flipped + 1 :],  # case change
        ]
        for value in malformed:
            assert post(self.BODY, {**good, "x-sinch-webhook-signature": value}).status_code == 401

    def test_empty_body_without_signature(self):
        assert client.post("/webhooks/sinch", content=b"").status_code == 401

    def test_signed_non_json_body(self):
        body = b"not json"
        assert post(body, signed_headers(body)).status_code == 400


class TestTolerance:
    BODY = json.dumps(PAYLOADS["message"]).encode()
    OLD = int(time.time()) - 3600

    def test_old_timestamp_accepted_by_default(self):
        assert post(self.BODY, signed_headers(self.BODY, timestamp=self.OLD)).status_code == 200

    def test_old_timestamp_rejected_with_tolerance(self, monkeypatch):
        monkeypatch.setenv("SINCH_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(self.BODY, signed_headers(self.BODY, timestamp=self.OLD)).status_code == 401

    def test_fresh_timestamp_accepted_with_tolerance(self, monkeypatch):
        monkeypatch.setenv("SINCH_WEBHOOK_TOLERANCE_SECONDS", "300")
        assert post(self.BODY, signed_headers(self.BODY)).status_code == 200


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
