import hashlib
import hmac
import json
import os
import time
import uuid

import pytest
from fastapi.testclient import TestClient

SECRET = "test_purchasely_webhook_secret_0123456789"
os.environ["PURCHASELY_WEBHOOK_SECRET"] = SECRET
os.environ.pop("PURCHASELY_WEBHOOK_TOLERANCE_SECONDS", None)

from main import app, compute_purchasely_signature, verify_purchasely_request  # noqa: E402

client = TestClient(app)


def sign(body, timestamp, secret=SECRET):
    """Independent signer: HMAC-SHA256 hex over timestamp + body, no separator."""
    if isinstance(body, str):
        body = body.encode("utf-8")
    return hmac.new(secret.encode(), timestamp.encode("latin-1") + body, hashlib.sha256).hexdigest()


def now_ts():
    return str(int(time.time()))


def sample_payload(event_name="SUBSCRIPTION_STARTED", event_id=None):
    """Shapes follow the documented samples (SUBSCRIPTION_STARTED, TRANSACTION_PROCESSED, ...)."""
    return {
        "api_version": 3,
        "event_id": event_id or f"evt_{uuid.uuid4().hex}",
        "event_name": event_name,
        "event_created_at": "2023-12-12T13:51:04.953Z",
        "environment": "SANDBOX",
        "plan": "monthly",
        "product": "PURCHASELY_PLUS",
        "purchasely_subscription_id": "subs_D7GnVQbUxvY6YxoeK6nhyPDkmyCVcfe",
        "store": "GOOGLE_PLAY_STORE",
        "subscription_status": "AUTO_RENEWING",
        "user_id": "user_123",
        "amount_in_eur": 9.99,
    }


def post(body=None, headers=None, content_type="application/json"):
    if body is None:
        body = json.dumps(sample_payload())
    if isinstance(body, str):
        body = body.encode("utf-8")
    all_headers = {"Content-Type": content_type, **(headers or {})}
    return client.post("/webhooks/purchasely", content=body, headers=all_headers)


def signed_post(body=None, timestamp=None, secret=SECRET, content_type="application/json"):
    if body is None:
        body = json.dumps(sample_payload())
    timestamp = timestamp or now_ts()
    return post(
        body,
        {"X-PURCHASELY-TIMESTAMP": timestamp, "X-PURCHASELY-REQUEST-SIGNATURE": sign(body, timestamp, secret)},
        content_type,
    )


class TestPublishedVector:
    """Worked example from https://docs.purchasely.com/docs/webhook (secret "foobar")."""

    secret = "foobar"
    body = '{"a_random_key":"a_random_value_ad"}'
    headers = {
        "x-purchasely-timestamp": "1698322022",
        "x-purchasely-request-signature": "f3c2a452e9ea72f41107321aeaf7999f1054148866a710c9b23f9f501785e2a4",
    }

    def test_computes_the_documented_signature(self):
        sig = compute_purchasely_signature("1698322022", self.body.encode(), self.secret)
        assert sig == "f3c2a452e9ea72f41107321aeaf7999f1054148866a710c9b23f9f501785e2a4"

    def test_verifies_the_documented_request(self):
        assert verify_purchasely_request(self.headers, self.body.encode(), self.secret, 0) is True

    def test_rejects_the_documented_request_under_a_different_secret(self):
        assert verify_purchasely_request(self.headers, self.body.encode(), "foobaz", 0) is False


class TestSignatureVerification:
    def test_accepts_a_correctly_signed_request(self):
        res = signed_post()
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_any_content_type(self):
        assert signed_post(content_type="text/plain").status_code == 200

    def test_accepts_an_uppercase_hex_digest(self):
        body, ts = json.dumps(sample_payload()), now_ts()
        res = post(body, {"X-PURCHASELY-TIMESTAMP": ts, "X-PURCHASELY-REQUEST-SIGNATURE": sign(body, ts).upper()})
        assert res.status_code == 200

    def test_verifies_multi_byte_bodies_byte_for_byte(self):
        assert signed_post(json.dumps({**sample_payload(), "plan": "mensuel é €"}, ensure_ascii=False)).status_code == 200

    def test_rejects_a_missing_signature(self):
        assert post(headers={"X-PURCHASELY-TIMESTAMP": now_ts()}).status_code == 401

    def test_rejects_a_missing_timestamp(self):
        body = json.dumps(sample_payload())
        assert post(body, {"X-PURCHASELY-REQUEST-SIGNATURE": sign(body, "")}).status_code == 401

    def test_rejects_an_empty_signature_header(self):
        res = post(headers={"X-PURCHASELY-TIMESTAMP": now_ts(), "X-PURCHASELY-REQUEST-SIGNATURE": ""})
        assert res.status_code == 401

    def test_rejects_a_tampered_body(self):
        ts = now_ts()
        signed = json.dumps(sample_payload(event_id="evt_a"))
        res = post(
            json.dumps(sample_payload(event_id="evt_b")),
            {"X-PURCHASELY-TIMESTAMP": ts, "X-PURCHASELY-REQUEST-SIGNATURE": sign(signed, ts)},
        )
        assert res.status_code == 401

    def test_rejects_a_signature_made_over_a_different_timestamp(self):
        body = json.dumps(sample_payload())
        res = post(body, {"X-PURCHASELY-TIMESTAMP": now_ts(), "X-PURCHASELY-REQUEST-SIGNATURE": sign(body, "1698322022")})
        assert res.status_code == 401

    def test_rejects_a_signature_made_with_another_secret(self):
        assert signed_post(secret="another_secret").status_code == 401

    def test_rejects_a_prefixed_digest(self):
        body, ts = json.dumps(sample_payload()), now_ts()
        res = post(body, {"X-PURCHASELY-TIMESTAMP": ts, "X-PURCHASELY-REQUEST-SIGNATURE": f"sha256={sign(body, ts)}"})
        assert res.status_code == 401

    def test_rejects_a_64_character_value_that_is_not_hex(self):
        res = post(headers={"X-PURCHASELY-TIMESTAMP": now_ts(), "X-PURCHASELY-REQUEST-SIGNATURE": "z" * 64})
        assert res.status_code == 401

    def test_rejects_a_digest_of_the_wrong_length(self):
        body, ts = json.dumps(sample_payload()), now_ts()
        res = post(body, {"X-PURCHASELY-TIMESTAMP": ts, "X-PURCHASELY-REQUEST-SIGNATURE": sign(body, ts)[:62]})
        assert res.status_code == 401

    def test_does_not_use_the_deprecated_signature_header(self):
        body, ts = json.dumps(sample_payload()), now_ts()
        res = post(body, {"X-PURCHASELY-TIMESTAMP": ts, "X-PURCHASELY-SIGNATURE": sign(body, ts)})
        assert res.status_code == 401


class TestTimestampTolerance:
    body = '{"event_name":"SUBSCRIPTION_STARTED"}'
    old_ts = str(int(time.time()) - 86400)
    old_headers = {
        "x-purchasely-timestamp": old_ts,
        "x-purchasely-request-signature": sign(body, old_ts),
    }

    def test_accepts_old_timestamps_by_default(self):
        res = post(self.body, {k.upper(): v for k, v in self.old_headers.items()})
        assert res.status_code == 200

    def test_rejects_old_timestamps_when_a_tolerance_is_set(self):
        assert verify_purchasely_request(self.old_headers, self.body.encode(), SECRET, 300) is False

    def test_accepts_recent_timestamps_when_a_tolerance_is_set(self):
        ts = now_ts()
        headers = {"x-purchasely-timestamp": ts, "x-purchasely-request-signature": sign(self.body, ts)}
        assert verify_purchasely_request(headers, self.body.encode(), SECRET, 300) is True

    def test_treats_zero_as_off(self):
        assert verify_purchasely_request(self.old_headers, self.body.encode(), SECRET, 0) is True


class TestRequestHandling:
    def test_returns_400_for_a_signed_body_that_is_not_json(self):
        assert signed_post("{not json").status_code == 400

    def test_returns_400_for_a_signed_json_array(self):
        assert signed_post("[1,2,3]").status_code == 400

    @pytest.mark.parametrize(
        "name",
        [
            "SUBSCRIPTION_STARTED", "SUBSCRIPTION_RENEWED", "RENEWAL_DISABLED", "GRACE_PERIOD_STARTED",
            "ENTERED_BILLING_RETRY", "SUBSCRIPTION_TERMINATED", "TRANSACTION_PROCESSED", "ACTIVATE",
            "SOMETHING_NEW",
        ],
    )
    def test_answers_exactly_200_for_handled_and_unknown_events(self, name):
        res = signed_post(json.dumps(sample_payload(name)))
        assert res.status_code == 200
        assert "duplicate" not in res.json()

    def test_skips_a_retried_event_with_the_same_event_id(self):
        body = json.dumps(sample_payload("SUBSCRIPTION_RENEWED", "evt_retry_1"))
        first, second = signed_post(body), signed_post(body)
        assert first.json() == {"received": True}
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}


class TestVerifyFunction:
    def test_rejects_everything_when_no_secret_is_configured(self):
        headers = {"x-purchasely-timestamp": "1", "x-purchasely-request-signature": sign("{}", "1", "")}
        assert verify_purchasely_request(headers, b"{}", "", 0) is False


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}
