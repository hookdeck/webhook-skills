import os
import time

import pytest
from fastapi.testclient import TestClient

SECRET = "configcat_whsk_VN3juirnVh5pNvCKd81RYRYchxUX4j3NykbZG2fAy88="
os.environ["CONFIGCAT_WEBHOOK_SECRET"] = SECRET

from main import app, compute_signature, verify_configcat_webhook  # noqa: E402

client = TestClient(app)
URL = "/webhooks/configcat"

# Published vector from ConfigCat's docs (also verified against Hookdeck's CONFIGCAT source)
VECTOR_BODY = b"examplebody"
VECTOR_ID = "b616ca659d154a5fb907dd8475792eeb"
VECTOR_TIMESTAMP = "1669629035"
VECTOR_SIGNATURE = "Ks3cYsu9Lslfo+hVxNC3oQWnsF9e5d73TI5t94D9DRA="


def sign(body: bytes, webhook_id="wh-1", timestamp=None):
    timestamp = timestamp or str(int(time.time()))
    return {
        "x-configcat-webhook-id": webhook_id,
        "x-configcat-webhook-timestamp": timestamp,
        "x-configcat-webhook-signature-v1": compute_signature(SECRET, webhook_id, timestamp, body),
    }


@pytest.fixture(autouse=True)
def no_tolerance(monkeypatch):
    monkeypatch.delenv("CONFIGCAT_WEBHOOK_TOLERANCE_SECONDS", raising=False)


class TestPublishedVector:
    def test_computes_documented_signature(self):
        assert compute_signature(SECRET, VECTOR_ID, VECTOR_TIMESTAMP, VECTOR_BODY) == VECTOR_SIGNATURE

    def test_verifier_accepts_documented_headers(self):
        assert verify_configcat_webhook(VECTOR_BODY, VECTOR_ID, VECTOR_TIMESTAMP, VECTOR_SIGNATURE, SECRET) is None

    def test_accepted_over_http(self):
        res = client.post(
            URL,
            content=VECTOR_BODY,
            headers={
                "content-type": "text/plain",
                "x-configcat-webhook-id": VECTOR_ID,
                "x-configcat-webhook-timestamp": VECTOR_TIMESTAMP,
                "x-configcat-webhook-signature-v1": VECTOR_SIGNATURE,
            },
        )
        assert res.status_code == 200


class TestConfigCatWebhook:
    def test_accepts_signed_json_body(self):
        body = b'{"config":"Main","environment":"Production"}'
        res = client.post(URL, content=body, headers={**sign(body), "content-type": "application/json"})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_signed_non_json_body(self):
        body = b"Main changed in Production"
        res = client.post(URL, content=body, headers={**sign(body), "content-type": "text/plain"})
        assert res.status_code == 200

    def test_verifies_exact_bytes_including_non_utf8(self):
        body = bytes([0xFF, 0xFE, 0x00, 0x7B, 0x80])
        res = client.post(URL, content=body, headers={**sign(body), "content-type": "application/octet-stream"})
        assert res.status_code == 200

    def test_accepts_signed_get_with_no_body(self):
        assert client.get(URL, headers=sign(b"")).status_code == 200

    @pytest.mark.parametrize("method", ["PUT", "PATCH", "DELETE"])
    def test_accepts_other_methods(self, method):
        assert client.request(method, URL, headers=sign(b"")).status_code == 200

    def test_rejects_unsigned_request(self):
        assert client.post(URL, content=b"{}").status_code == 401

    def test_rejects_body_changed_after_signing(self):
        res = client.post(URL, content=b'{"a":2}', headers=sign(b'{"a":1}'))
        assert res.status_code == 401

    def test_rejects_signature_from_another_key(self):
        headers = sign(b"{}")
        headers["x-configcat-webhook-signature-v1"] = compute_signature(
            "configcat_whsk_other", "wh-1", headers["x-configcat-webhook-timestamp"], b"{}"
        )
        assert client.post(URL, content=b"{}", headers=headers).status_code == 401

    def test_rejects_two_comma_separated_signatures(self):
        headers = sign(b"{}")
        headers["x-configcat-webhook-signature-v1"] += "," + VECTOR_SIGNATURE
        assert client.post(URL, content=b"{}", headers=headers).status_code == 401

    @pytest.mark.parametrize(
        "bad",
        ["abc", VECTOR_SIGNATURE[:-1], VECTOR_SIGNATURE.replace("=", "A") + "A", "v1=" + VECTOR_SIGNATURE],
    )
    def test_rejects_malformed_signatures(self, bad):
        headers = {**sign(b"{}"), "x-configcat-webhook-signature-v1": bad}
        assert client.post(URL, content=b"{}", headers=headers).status_code == 401

    def test_compares_base64_case_sensitively(self):
        error = verify_configcat_webhook(
            VECTOR_BODY, VECTOR_ID, VECTOR_TIMESTAMP, VECTOR_SIGNATURE.replace("Ks3c", "kS3C"), SECRET
        )
        assert error is not None

    def test_rejects_non_canonical_base64(self):
        alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
        # A stray low bit in the last character decodes to the same bytes, but is not the signature sent
        bad = VECTOR_SIGNATURE[:42] + alphabet[alphabet.index(VECTOR_SIGNATURE[42]) | 1] + "="
        assert verify_configcat_webhook(VECTOR_BODY, VECTOR_ID, VECTOR_TIMESTAMP, bad, SECRET) is not None

    def test_ignores_old_timestamps_by_default(self):
        res = client.post(URL, content=b"{}", headers=sign(b"{}", "wh-old", VECTOR_TIMESTAMP))
        assert res.status_code == 200

    def test_rejects_old_timestamps_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("CONFIGCAT_WEBHOOK_TOLERANCE_SECONDS", "300")
        old = client.post(URL, content=b"{}", headers=sign(b"{}", "wh-old", VECTOR_TIMESTAMP))
        assert old.status_code == 401
        assert client.post(URL, content=b"{}", headers=sign(b"{}")).status_code == 200
