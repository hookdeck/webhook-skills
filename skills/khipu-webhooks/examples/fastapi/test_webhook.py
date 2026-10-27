import base64
import hashlib
import hmac
import json
import logging
import os
import time

import pytest
from fastapi.testclient import TestClient

# Khipu's merchant secret is an opaque string; this one is only for tests
SECRET = "test_khipu_merchant_secret_5f0c1a7e"
os.environ["KHIPU_WEBHOOK_SECRET"] = SECRET

from main import app, verify_khipu  # noqa: E402

client = TestClient(app)

# Published test vector from Khipu's docs (exact bytes: string amounts, escaped slashes)
VECTOR_SECRET = "1a4cbbbeb8bdb7e1d73572b9cc43ce4ce18f79d9"
VECTOR_HEADER = "t=1711965600393,s=rq08YUGSaWa1D0RAwhMnJTRHMNmY4ToCn2Gd6G9LaDg="
VECTOR_BODY = r'''{"payment_id":"zfxnocsow6mz","receiver_id":990939,"subject":"TEST_COBRO","amount":"1000.0000","discount":"0.0000","currency":"CLP","receipt_url":"https:\/\/s3.amazonaws.com\/staging.notifications.khipu.com\/CPKH-1804240956-zfxnocsow6mz.pdf","bank":"DemoBank","bank_id":"Bawdf","payer_name":"Cobrador de desarrollo #990.939","payer_email":"test@khipu.com","personal_identifier":"44.444.444-4","bank_account_number":"000000000000444444444","out_of_date_conciliation":false,"transaction_id":"15f836bd-e8a7-4d12-b2f1-56403012b555","authorizer_operation_code":"AUT-20240418-0001","responsible_user_email":"test@khipu.com","payment_method":"simplified_transfer","conciliation_date":"2024-04-18T13:56:54.859Z"}'''

ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"


@pytest.fixture(autouse=True)
def reset_env(monkeypatch):
    monkeypatch.setenv("KHIPU_WEBHOOK_SECRET", SECRET)
    monkeypatch.delenv("KHIPU_WEBHOOK_TOLERANCE_SECONDS", raising=False)


def now_ms() -> int:
    return int(time.time() * 1000)


def sign_sig(body: str, timestamp, secret=SECRET) -> str:
    digest = hmac.new(secret.encode(), f"{timestamp}.{body}".encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def sign(body: str, timestamp=None, secret=SECRET) -> str:
    """Matches Khipu: t=<unix ms>,s=<base64 HMAC-SHA256 of "<t>.<body>">."""
    ts = now_ms() if timestamp is None else timestamp
    return f"t={ts},s={sign_sig(body, ts, secret)}"


def payment(**overrides) -> str:
    """Payload as shown in Khipu's docs (reconciliation)."""
    data = {
        "payment_id": "zfxnocsow6mz",
        "receiver_id": 990939,
        "subject": "TEST_COBRO",
        "amount": 1000.0,
        "discount": 0.0,
        "currency": "CLP",
        "receipt_url": "https://s3.amazonaws.com/staging.notifications.khipu.com/CPKH-1804240956-zfxnocsow6mz.pdf",
        "bank": "DemoBank",
        "bank_id": "Bawdf",
        "payer_name": "Developer User #990.939",
        "payer_email": "test@khipu.com",
        "personal_identifier": "44.444.444-4",
        "bank_account_number": "000000000000444444444",
        "out_of_date_conciliation": False,
        "transaction_id": "15f836bd-e8a7-4d12-b2f1-56403012b555",
        "authorizer_operation_code": "AUT-20240418-0001",
        "responsible_user_email": "test@khipu.com",
        "payment_method": "simplified_transfer",
        "conciliation_date": "2024-04-18T13:56:54.859Z",
    }
    data.update(overrides)
    return json.dumps(data)


def post(body, headers=None, content_type="application/json"):
    all_headers = {"Content-Type": content_type, **(headers or {})}
    return client.post("/webhooks/khipu", content=body, headers=all_headers)


class TestPublishedVector:
    def test_verifies_vendor_documentation_example(self):
        assert verify_khipu(VECTOR_BODY.encode(), VECTOR_HEADER, VECTOR_SECRET) is True

    def test_rejects_re_serialised_body(self):
        reserialised = json.dumps(json.loads(VECTOR_BODY))
        assert verify_khipu(reserialised.encode(), VECTOR_HEADER, VECTOR_SECRET) is False

    def test_accepts_vector_through_endpoint(self, monkeypatch):
        monkeypatch.setenv("KHIPU_WEBHOOK_SECRET", VECTOR_SECRET)
        res = post(VECTOR_BODY, {"x-khipu-signature": VECTOR_HEADER})
        assert res.status_code == 200


class TestSignatureVerification:
    def test_accepts_valid_signature(self, caplog):
        body = payment()
        with caplog.at_level(logging.INFO, logger="khipu-webhooks"):
            res = post(body, {"x-khipu-signature": sign(body)})
        assert res.status_code == 200
        assert res.json() == {"received": True}
        assert "Payment zfxnocsow6mz reconciled" in caplog.text

    def test_verifies_any_content_type(self):
        body = payment()
        res = post(body, {"x-khipu-signature": sign(body)}, "text/plain")
        assert res.status_code == 200

    def test_rejects_missing_header(self):
        assert post(payment()).status_code == 401

    def test_rejects_empty_header(self):
        assert post(payment(), {"x-khipu-signature": ""}).status_code == 401

    def test_rejects_wrong_secret(self):
        body = payment()
        assert post(body, {"x-khipu-signature": sign(body, secret="other")}).status_code == 401

    def test_rejects_tampered_body(self):
        header = sign(payment())
        assert post(payment(amount=1), {"x-khipu-signature": header}).status_code == 401

    def test_rejects_header_without_t(self):
        body = payment()
        s = sign(body).split(",s=")[1]
        assert post(body, {"x-khipu-signature": f"s={s}"}).status_code == 401

    def test_rejects_header_without_s(self):
        assert post(payment(), {"x-khipu-signature": f"t={now_ms()}"}).status_code == 401

    def test_rejects_signature_that_is_not_padded_base64(self):
        body = payment()
        header = sign(body)
        assert post(body, {"x-khipu-signature": header.rstrip("=")}).status_code == 401

    def test_rejects_stray_low_bits_in_last_character(self):
        # Same decoded bytes, different string: Hookdeck rejects it, so must we
        body = payment()
        t_part, sig = sign(body).split(",s=")
        idx = ALPHABET.index(sig[42])
        twin = ALPHABET[idx - 3 if (idx + 1) % 4 == 0 else idx + 1]
        forged = sig[:42] + twin + "="
        assert base64.b64decode(forged, validate=True) == base64.b64decode(sig, validate=True)
        assert post(body, {"x-khipu-signature": f"{t_part},s={forged}"}).status_code == 401

    def test_accepts_when_any_s_entry_matches(self):
        body = payment()
        ts = now_ms()
        good = sign_sig(body, ts)
        bad = sign_sig(body, ts, "old")
        assert post(body, {"x-khipu-signature": f"t={ts},s={bad},s={good}"}).status_code == 200

    def test_ignores_unknown_keys(self):
        body = payment()
        assert post(body, {"x-khipu-signature": f"{sign(body)},v=2"}).status_code == 200

    def test_returns_500_when_secret_missing(self, monkeypatch):
        monkeypatch.delenv("KHIPU_WEBHOOK_SECRET")
        body = payment()
        assert post(body, {"x-khipu-signature": sign(body)}).status_code == 500

    def test_returns_400_for_signed_non_json(self):
        body = "not json"
        res = post(body, {"x-khipu-signature": sign(body)}, "text/plain")
        assert res.status_code == 400


class TestTimestampTolerance:
    @staticmethod
    def one_hour_ago() -> int:
        return now_ms() - 3600 * 1000

    def test_accepts_old_timestamps_by_default(self):
        body = payment()
        assert post(body, {"x-khipu-signature": sign(body, self.one_hour_ago())}).status_code == 200

    def test_rejects_old_timestamps_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("KHIPU_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = payment()
        assert post(body, {"x-khipu-signature": sign(body, self.one_hour_ago())}).status_code == 401

    def test_accepts_fresh_timestamps_when_tolerance_set(self, monkeypatch):
        monkeypatch.setenv("KHIPU_WEBHOOK_TOLERANCE_SECONDS", "300")
        body = payment()
        assert post(body, {"x-khipu-signature": sign(body)}).status_code == 200

    def test_invalid_tolerance_is_off(self, monkeypatch):
        monkeypatch.setenv("KHIPU_WEBHOOK_TOLERANCE_SECONDS", "abc")
        body = payment()
        assert post(body, {"x-khipu-signature": sign(body, self.one_hour_ago())}).status_code == 200
