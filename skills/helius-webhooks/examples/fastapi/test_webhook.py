import json
import os

import pytest
from fastapi.testclient import TestClient

# Helius sends the configured authHeader verbatim as the Authorization header
AUTH = "Bearer test_helius_secret_token"
os.environ["HELIUS_AUTH_HEADER"] = AUTH

from main import app, seen_signatures, verify_helius_auth  # noqa: E402

client = TestClient(app)


def make_tx(tx_type, signature):
    return {
        "type": tx_type,
        "source": "MAGIC_EDEN",
        "description": f"{tx_type} test transaction",
        "signature": signature,
        "slot": 171942732,
        "timestamp": 1673445241,
        "fee": 10000,
        "feePayer": "CKs1E69a2e9TmH4mKKLrXFF8kD3ZnwKjoEuXa6sz9WqX",
        "nativeTransfers": [],
        "tokenTransfers": [],
    }


def post(body, auth=AUTH):
    headers = {"Content-Type": "application/json"}
    if auth is not None:
        headers["Authorization"] = auth
    data = body if isinstance(body, str) else json.dumps(body)
    return client.post("/webhooks/helius", content=data, headers=headers)


@pytest.fixture(autouse=True)
def reset_state():
    seen_signatures.clear()
    os.environ["HELIUS_AUTH_HEADER"] = AUTH


class TestVerifyHeliusAuth:
    def test_accepts_identical_value(self):
        assert verify_helius_auth("Bearer abc", "Bearer abc")

    def test_rejects_different_values_and_lengths(self):
        assert not verify_helius_auth("Bearer abd", "Bearer abc")
        assert not verify_helius_auth("Bearer ab", "Bearer abc")
        assert not verify_helius_auth("abc", "Bearer abc")

    def test_rejects_missing_values(self):
        assert not verify_helius_auth(None, "Bearer abc")
        assert not verify_helius_auth("Bearer abc", None)


class TestWebhookEndpoint:
    def test_accepts_correct_authorization(self):
        assert post([make_tx("NFT_SALE", "sig-nft-sale-1")]).status_code == 200

    @pytest.mark.parametrize("tx_type", ["NFT_SALE", "SWAP", "TRANSFER"])
    def test_handles_event_types(self, tx_type):
        assert post([make_tx(tx_type, f"sig-{tx_type}")]).status_code == 200

    def test_accepts_raw_transactions_without_type(self):
        assert post([{"signature": "sig-raw-1", "slot": 1, "transaction": {}}]).status_code == 200

    def test_accepts_batch(self):
        res = post([make_tx("SWAP", "sig-b1"), make_tx("TRANSFER", "sig-b2")])
        assert res.status_code == 200
        assert {"sig-b1", "sig-b2"} <= seen_signatures

    def test_skips_duplicate_signature(self, capsys):
        post([make_tx("SWAP", "sig-dup")])
        post([make_tx("SWAP", "sig-dup")])
        assert capsys.readouterr().out.count("Swap:") == 1

    def test_accepts_unknown_type(self):
        assert post([make_tx("UNKNOWN", "sig-unknown")]).status_code == 200

    def test_rejects_missing_authorization(self):
        assert post([make_tx("SWAP", "sig-x")], auth=None).status_code == 401

    def test_rejects_wrong_authorization(self):
        assert post([make_tx("SWAP", "sig-x")], auth="Bearer wrong").status_code == 401

    def test_rejects_secret_without_bearer_prefix(self):
        assert post([make_tx("SWAP", "sig-x")], auth="test_helius_secret_token").status_code == 401

    def test_rejects_invalid_json(self):
        assert post("not json").status_code == 400

    def test_returns_500_when_secret_not_configured(self):
        del os.environ["HELIUS_AUTH_HEADER"]
        assert post([make_tx("SWAP", "sig-x")]).status_code == 500


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "healthy"}
