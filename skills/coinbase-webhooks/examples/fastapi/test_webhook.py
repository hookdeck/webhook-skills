import hashlib
import hmac
import itertools
import json
import os
import time

import pytest
from fastapi.testclient import TestClient

# CDP subscription secrets are plain strings used as UTF-8 bytes: no prefix, no base64.
os.environ["COINBASE_WEBHOOK_SECRET"] = "test_cdp_subscription_secret"

from main import app, normalize_onchain_activity, processed_events, verify_coinbase_signature  # noqa: E402

client = TestClient(app)

SECRET = os.environ["COINBASE_WEBHOOK_SECRET"]
H = "content-type x-event-id x-event-type"
ONCHAIN = "onchain.activity.detected"
_counter = itertools.count()


def hmac_hex(content: str, key: str = SECRET) -> str:
    return hmac.new(key.encode(), content.encode(), hashlib.sha256).hexdigest()


def sign_header(body: str, headers: dict, t=None, key: str = SECRET, h: str = H, order=None) -> str:
    """Sign the way CDP does: v0 over `{t}.{body}`, v1 over `{t}.{h}.{header_values}.{body}`."""
    t = int(time.time()) if t is None else t
    values = ".".join(headers.get(n, "") for n in h.split(" "))
    parts = {
        "t": f"t={t}",
        "v0": f"v0={hmac_hex(f'{t}.{body}', key)}",
        "h": f"h={h}",
        "v1": f"v1={hmac_hex(f'{t}.{h}.{values}.{body}', key)}",
    }
    return ",".join(parts[k] for k in (order or ["t", "v0", "h", "v1"]))


_UNSET = object()


def deliver(body_obj, event_type=None, event_id=None, signature=_UNSET, sig_header="X-Webhook-Signature",
            sign_opts=None, mutate=None, raw_override=None):
    body = body_obj if isinstance(body_obj, str) else json.dumps(body_obj)
    headers = {
        "content-type": "application/json",
        "x-event-id": event_id or f"3a3dd092-55ce-4832-97d9-{next(_counter):012d}",
    }
    if event_type:
        headers["x-event-type"] = event_type
    sig = sign_header(body, headers, **(sign_opts or {})) if signature is _UNSET else signature
    if mutate:
        mutate(headers)
    if sig is not None:
        headers[sig_header] = sig
    return client.post("/webhooks/coinbase", content=raw_override or body, headers=headers)


FLAT_ONCHAIN = {
    "block_number": 38218578,
    "contract_address": "0x125E6687d4313864e53df431d5425969c15Eb2F",
    "event_name": "Transfer",
    "event_signature": "Transfer(address,address,uint256)",
    "log_index": 755,
    "network": "base-mainnet",
    "parameters": {"from": "0xfrom", "to": "0xto", "value": "637064239"},
    "timestamp": "2025-11-15T17:08:24Z",
    "transaction_from": "0xfrom",
    "transaction_hash": "0xabc",
    "transaction_to": "0xto",
}

ENVELOPED_ONCHAIN = {
    "id": "evt_1a2b3c4d5e6f",
    "type": ONCHAIN,
    "createdAt": "2025-10-08T14:32:15.123Z",
    "data": {
        "subscriptionId": "sub_123",
        "networkId": "base-mainnet",
        "blockNumber": 12345678,
        "transactionHash": "0xdef",
        "logIndex": 3,
        "contractAddress": "0x8335...2913",
        "eventName": "Transfer",
        "from": "0xfrom",
        "to": "0xto",
        "value": "1000000",
    },
}


@pytest.fixture(autouse=True)
def _reset():
    processed_events.clear()
    yield


class TestSignatureVerification:
    def test_valid_v1(self):
        res = deliver(FLAT_ONCHAIN, event_type=ONCHAIN)
        assert res.status_code == 200
        assert res.json() == {"received": True, "type": ONCHAIN}

    def test_any_part_order(self):
        res = deliver(FLAT_ONCHAIN, event_type=ONCHAIN, sign_opts={"order": ["h", "v1", "t", "v0"]})
        assert res.status_code == 200

    def test_v0_fallback(self):
        body = json.dumps(FLAT_ONCHAIN)
        t = int(time.time())
        res = deliver(body, event_type=ONCHAIN, signature=f"t={t},v0={hmac_hex(f'{t}.{body}')}")
        assert res.status_code == 200

    def test_deprecated_hook0_header(self):
        res = deliver(FLAT_ONCHAIN, event_type=ONCHAIN, sig_header="X-Hook0-Signature")
        assert res.status_code == 200

    def test_missing_signature(self):
        assert deliver(FLAT_ONCHAIN, event_type=ONCHAIN, signature=None).status_code == 400

    def test_wrong_secret(self):
        assert deliver(FLAT_ONCHAIN, event_type=ONCHAIN, sign_opts={"key": "wrong"}).status_code == 400

    def test_tampered_body(self):
        body = json.dumps(FLAT_ONCHAIN)
        res = deliver(body, event_type=ONCHAIN, raw_override=body.replace("637064239", "999999999"))
        assert res.status_code == 400

    def test_tampered_bound_header(self):
        def mutate(h):
            h["x-event-type"] = "payments.transfers.completed"

        assert deliver(FLAT_ONCHAIN, event_type=ONCHAIN, mutate=mutate).status_code == 400

    @pytest.mark.parametrize("bad", ["abc", "zz" * 32, "a" * 63])
    def test_malformed_hex_returns_400(self, bad):
        t = int(time.time())
        res = deliver(FLAT_ONCHAIN, event_type=ONCHAIN, signature=f"t={t},h={H},v1={bad}")
        assert res.status_code == 400

    def test_stale_timestamp(self):
        res = deliver(FLAT_ONCHAIN, event_type=ONCHAIN, sign_opts={"t": int(time.time()) - 600})
        assert res.status_code == 400

    def test_non_numeric_timestamp(self):
        assert deliver(FLAT_ONCHAIN, event_type=ONCHAIN, sign_opts={"t": "abc"}).status_code == 400

    def test_missing_secret_returns_500(self, monkeypatch):
        monkeypatch.delenv("COINBASE_WEBHOOK_SECRET")
        assert deliver(FLAT_ONCHAIN, event_type=ONCHAIN).status_code == 500

    def test_invalid_json(self):
        assert deliver("not json", event_type=ONCHAIN).status_code == 400

    def test_scheme_v0_ignores_v1(self):
        t = int(time.time())
        body = b'{"a":1}'
        v0 = hmac_hex(str(t) + "." + body.decode())
        header = f"t={t},v0={v0},h={H},v1={'0' * 64}"
        assert verify_coinbase_signature(body, header, lambda n: None, SECRET)[0] is False
        assert verify_coinbase_signature(body, header, lambda n: None, SECRET, scheme="v0")[0] is True


class TestEventHandling:
    def test_dedupes_on_event_id(self):
        first = deliver(FLAT_ONCHAIN, event_type=ONCHAIN, event_id="dup-1")
        second = deliver(FLAT_ONCHAIN, event_type=ONCHAIN, event_id="dup-1")
        assert "duplicate" not in first.json()
        assert second.status_code == 200
        assert second.json() == {"received": True, "duplicate": True}

    def test_both_onchain_body_shapes(self):
        assert deliver(FLAT_ONCHAIN, event_type=ONCHAIN).status_code == 200
        assert deliver(ENVELOPED_ONCHAIN, event_type=ONCHAIN).status_code == 200
        flat = normalize_onchain_activity(FLAT_ONCHAIN)
        env = normalize_onchain_activity(ENVELOPED_ONCHAIN)
        assert (flat["transaction_hash"], flat["log_index"], flat["network"]) == ("0xabc", 755, "base-mainnet")
        assert (env["transaction_hash"], env["log_index"], env["network"]) == ("0xdef", 3, "base-mainnet")

    def test_transfers_routed_by_body_event_type(self):
        res = deliver({
            "eventID": "0f8c2a52-9d1e-4b8e-8a5e-3b7f0c2d1e4a",
            "eventType": "payments.transfers.completed",
            "timestamp": "2025-01-01T00:00:00Z",
            "data": {"transferId": "transfer_1", "status": "completed", "targetAmount": "100.00", "targetAsset": "usdc"},
        })
        assert res.json() == {"received": True, "type": "payments.transfers.completed"}

    def test_transfers_expired(self, capsys):
        # data.status stays "quoted" on expired events; routing must key off the event type.
        res = deliver({
            "eventID": "7b1e9c3a-2f4d-4e8a-9c6b-1d2e3f4a5b6c",
            "eventType": "payments.transfers.expired",
            "timestamp": "2025-01-01T00:15:00Z",
            "data": {"transferId": "transfer_2", "status": "quoted", "expiresAt": "2025-01-01T00:15:00Z"},
        })
        assert res.json() == {"received": True, "type": "payments.transfers.expired"}
        out = capsys.readouterr().out
        assert "transfer_2 quote expired" in out
        assert "Unhandled" not in out

    def test_solana_wallet_event(self):
        res = deliver(
            {"transaction_signature": "5Kd...", "address": "So1...", "network": "solana-devnet"},
            event_type="wallet.transaction.confirmed",
        )
        assert res.status_code == 200

    def test_onramp_event(self):
        res = deliver({"eventType": "onramp.transaction.updated", "orderId": "order_1",
                       "status": "ONRAMP_ORDER_STATUS_COMPLETED"})
        assert res.json()["type"] == "onramp.transaction.updated"

    def test_unknown_event(self):
        assert deliver({"foo": "bar"}, event_type="something.new").status_code == 200
