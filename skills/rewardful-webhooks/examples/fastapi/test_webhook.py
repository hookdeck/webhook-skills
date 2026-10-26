import hashlib
import hmac
import itertools
import json
import os

# Set test environment variables before importing the app
os.environ["REWARDFUL_WEBHOOK_SECRET"] = "test_rewardful_signing_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, seen_events, verify_rewardful_signature

client = TestClient(app)

SECRET = os.environ["REWARDFUL_WEBHOOK_SECRET"]

# Payload as shown in Rewardful's docs (https://developers.rewardful.com/webhooks/requests#example-payload)
AFFILIATE_CONFIRMED = {
    "object": {
        "id": "3433fffa-8255-4843-81b1-22aebc21eb34",
        "first_name": "James",
        "last_name": "Bond",
        "email": "james@mi6.co.uk",
        "created_at": "2019-06-24T00:43:36.097Z",
        "updated_at": "2019-06-27T18:38:41.684Z",
        "referrals": 42,
        "conversions": 3,
        "confirmed_at": "2019-06-24T00:43:36.095Z",
        "links": [
            {
                "id": "81bf1128-0ba1-4c1c-835c-286521f8791a",
                "url": "http://www.demo.com:8080/?via=james",
                "token": "james",
                "referrals": 42,
                "conversions": 3,
            }
        ],
        "campaign": {"id": "82f26208-778e-4e98-a467-6ee264cf96d5", "name": "Friends of Acme"},
        "paypal_email": None,
        "sign_in_count": 0,
        "stripe_account_id": None,
        "unconfirmed_email": None,
        "stripe_customer_id": None,
        "paypal_email_confirmed_at": None,
        "receive_new_commission_notifications": True,
    },
    "event": {
        "id": "7fcdc81d-996a-4b7b-8faf-1db98b9d5507",
        "type": "affiliate.confirmed",
        "created_at": "2019-07-11T05:25:43.940Z",
        "api_version": "v1",
    },
    "request": {"id": "66a94f49-2b36-403c-83b8-91677cb1f460"},
}

HANDLED_EVENTS = [
    "affiliate.created", "affiliate.confirmed", "referral.lead", "referral.converted",
    "sale.created", "sale.refunded", "commission.created", "commission.paid",
    "payout.due", "payout.paid", "payout.failed",
]

_counter = itertools.count(1)


def sample_payload(event_type: str) -> dict:
    n = next(_counter)
    return {
        "object": {"id": f"00000000-0000-4000-8000-{n:012d}"},
        "event": {
            "id": f"evt-{n}",
            "type": event_type,
            "created_at": "2019-07-11T05:25:43.940Z",
            "api_version": "v1",
        },
        "request": {"id": f"req-{n}"},
    }


def sign(body: bytes, secret: str = SECRET) -> str:
    """Same algorithm as Rewardful: lowercase hex HMAC-SHA256 of the raw body, no prefix."""
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def post(body, signature=None, content_type="application/json"):
    if isinstance(body, dict):
        body = json.dumps(body).encode()
    elif isinstance(body, str):
        body = body.encode()
    headers = {"content-type": content_type}
    if signature is not None:
        headers["x-rewardful-signature"] = signature
    return client.post("/webhooks/rewardful", content=body, headers=headers)


@pytest.fixture(autouse=True)
def _clear_seen():
    seen_events.clear()


BODY = json.dumps(AFFILIATE_CONFIRMED).encode()


class TestSignatureVerification:
    def test_accepts_valid_signature(self):
        res = post(BODY, sign(BODY))
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex_signature(self):
        assert post(BODY, sign(BODY).upper()).status_code == 200

    def test_verifies_exact_bytes_any_content_type(self):
        assert post(BODY, sign(BODY), content_type="text/plain").status_code == 200

    def test_verifies_non_canonical_json_bytes(self):
        pretty = json.dumps(AFFILIATE_CONFIRMED, indent=2).encode()
        assert post(pretty, sign(pretty)).status_code == 200
        # A signature over the compact form does not match the pretty body
        assert post(pretty, sign(BODY)).status_code == 401

    def test_rejects_wrong_secret(self):
        assert post(BODY, sign(BODY, "wrong_secret")).status_code == 401

    def test_rejects_tampered_body(self):
        assert post(BODY.replace(b"James", b"Jamie"), sign(BODY)).status_code == 401

    def test_rejects_missing_signature(self):
        assert post(BODY).status_code == 401

    def test_rejects_empty_signature(self):
        assert post(BODY, "").status_code == 401

    def test_rejects_prefixed_signature(self):
        assert post(BODY, f"sha256={sign(BODY)}").status_code == 401

    def test_rejects_wrong_length_signature(self):
        assert post(BODY, sign(BODY)[:62]).status_code == 401

    def test_rejects_non_hex_signature_of_right_length(self):
        assert post(BODY, "z" * 64).status_code == 401

    def test_rejects_everything_when_secret_unset(self):
        assert verify_rewardful_signature(BODY, sign(BODY), "") is False
        assert verify_rewardful_signature(BODY, sign(BODY), SECRET) is True

    def test_rejects_non_bytes_body(self):
        assert verify_rewardful_signature(BODY.decode(), sign(BODY), SECRET) is False


class TestBodyHandling:
    def test_400_for_invalid_json_with_valid_signature(self):
        bad = b"{not json"
        assert post(bad, sign(bad)).status_code == 400

    def test_400_for_non_object_json(self):
        arr = b"[1,2]"
        assert post(arr, sign(arr)).status_code == 400

    def test_401_not_400_for_invalid_json_without_signature(self):
        assert post(b"{not json").status_code == 401


class TestEventHandling:
    def test_handles_documented_affiliate_confirmed_payload(self, capsys):
        res = post(BODY, sign(BODY))
        assert res.status_code == 200
        assert (
            "Affiliate confirmed: james@mi6.co.uk (3433fffa-8255-4843-81b1-22aebc21eb34)"
            in capsys.readouterr().out
        )

    @pytest.mark.parametrize("event_type", HANDLED_EVENTS)
    def test_handles_event(self, event_type, capsys):
        body = json.dumps(sample_payload(event_type)).encode()
        res = post(body, sign(body))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_acknowledges_unhandled_events(self, capsys):
        body = json.dumps(sample_payload("affiliate_coupon.activated")).encode()
        assert post(body, sign(body)).status_code == 200
        assert "Unhandled event: affiliate_coupon.activated" in capsys.readouterr().out

    def test_acknowledges_repeated_event_id_without_reprocessing(self, capsys):
        first = post(BODY, sign(BODY))
        second = post(BODY, sign(BODY))
        assert first.json() == {"received": True}
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}
        assert capsys.readouterr().out.count("Affiliate confirmed") == 1

    def test_non_object_event_field_does_not_crash(self):
        body = json.dumps({"event": "not-an-object", "object": {}}).encode()
        assert post(body, sign(body)).status_code == 200


def test_health_check():
    assert client.get("/health").json() == {"status": "ok"}
