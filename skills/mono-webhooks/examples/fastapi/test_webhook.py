import itertools
import json
import os

# Set test environment variables before importing the app
os.environ["MONO_WEBHOOK_SECRET"] = "test_mono_webhook_secret_0123456789"

import pytest
from fastapi.testclient import TestClient

from main import app, verify_mono_request

client = TestClient(app)

SECRET = os.environ["MONO_WEBHOOK_SECRET"]

EVENTS = [
    "mono.events.account_connected",
    "mono.events.account_updated",
    "mono.events.account_unlinked",
    "direct_debit.payment_successful",
    "direct_debit.payment_failed",
    "direct_debit.payment_cancelled",
    "direct_debit.payment_abandoned",
]

_ids = itertools.count(1)


def sample_payload(event="mono.events.account_connected"):
    """Payload shapes follow the sample webhooks in Mono's docs."""
    base = {"event": event, "event_id": f"evt_test_{next(_ids)}", "timestamp": "2026-01-27T21:00:39.588Z"}
    if event == "mono.events.account_connected":
        return {**base, "data": {
            "id": "6979274350b9c321c14524b1",
            "customer": "6961439d7716b67eba2d068a",
            "meta": {"data_status": "PROCESSING", "auth_method": "internet_banking", "ref": "4055877-T"},
            "app": "68cbf35e9DS6deec038a43d9",
            "business": "68ca76a195f6deec0384d6c0",
        }}
    if event == "mono.events.account_updated":
        return {**base, "data": {
            "account": {"_id": "697926f050B9c321c1451dda", "name": "Samuel Olamide", "currency": "NGN", "balance": 22967},
            "meta": {"data_status": "AVAILABLE", "auth_method": "internet_banking", "ref": "4055877-T"},
        }}
    if event == "mono.events.account_unlinked":
        return {**base, "data": {"id": "6979274350b9c321c14524b1"}}
    status = event.split(".")[1].replace("payment_", "")
    return {**base, "data": {"type": "onetime-debit", "object": {
        "id": "txd_wzb8uhew4j9ngru43a123456",
        "status": status,
        "amount": 20000,
        "fee": 6100,
        "currency": "NGN",
        "reference": "ZRDWCG1714385608212",
    }}}


def post(headers=None, body=None, content_type="application/json"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.post(
        "/webhooks/mono",
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestSecretVerification:
    def test_correct_secret(self):
        res = post({"mono-webhook-secret": SECRET})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_header_name_is_case_insensitive(self):
        assert post({"Mono-Webhook-Secret": SECRET}).status_code == 200

    def test_wrong_secret_same_length(self):
        assert post({"mono-webhook-secret": "x" * len(SECRET)}).status_code == 401

    def test_wrong_secret_different_length(self):
        assert post({"mono-webhook-secret": "short"}).status_code == 401

    def test_whole_value_must_match(self):
        assert post({"mono-webhook-secret": f"Bearer {SECRET}"}).status_code == 401
        assert post({"mono-webhook-secret": SECRET[:-1]}).status_code == 401

    def test_missing_secret(self):
        assert post().status_code == 401

    def test_authorization_header_is_not_accepted(self):
        assert post({"Authorization": f"Bearer {SECRET}"}).status_code == 401

    def test_unconfigured_secret_rejects_everything(self):
        assert verify_mono_request({"mono-webhook-secret": SECRET}, secret="") is False
        assert verify_mono_request({"mono-webhook-secret": SECRET}, secret=SECRET) is True

    def test_non_ascii_value_does_not_raise(self):
        assert verify_mono_request({"mono-webhook-secret": "sécret-ключ"}, secret=SECRET) is False
        assert verify_mono_request({"mono-webhook-secret": "sécret-ключ"}, secret="sécret-ключ") is True


class TestBodyHandling:
    def test_any_content_type(self):
        res = post({"mono-webhook-secret": SECRET}, content_type="text/plain")
        assert res.status_code == 200

    def test_invalid_json(self):
        assert post({"mono-webhook-secret": SECRET}, body="{not json").status_code == 400

    def test_non_object_json(self):
        assert post({"mono-webhook-secret": SECRET}, body="[1,2]").status_code == 400

    def test_invalid_json_without_secret_is_401(self):
        assert post(body="{not json").status_code == 401


class TestEventHandling:
    @pytest.mark.parametrize("event", EVENTS)
    def test_handles_event(self, event, capsys):
        res = post({"mono-webhook-secret": SECRET}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200
        assert "Unhandled" not in capsys.readouterr().out

    def test_unknown_event_is_acknowledged(self):
        res = post({"mono-webhook-secret": SECRET}, body=json.dumps(sample_payload("mono.events.something_new")))
        assert res.status_code == 200

    def test_dedupes_retries_on_event_id(self, capsys):
        body = json.dumps(sample_payload("direct_debit.payment_successful"))
        first = post({"mono-webhook-secret": SECRET}, body=body)
        retry = post({"mono-webhook-secret": SECRET}, body=body)
        assert first.json() == {"received": True}
        assert retry.status_code == 200
        assert retry.json() == {"received": True, "duplicate": True}
        assert capsys.readouterr().out.count("Payment successful") == 1


def test_health():
    assert client.get("/health").json() == {"status": "ok"}
