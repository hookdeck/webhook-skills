import hashlib
import hmac
import json
import os

import pytest
from fastapi.testclient import TestClient

# Before certification Deliverect signs with the call's channelLink or locationId; after,
# with the HMAC secret from Integration settings. Any string works as the key (UTF-8 bytes).
SECRET = "test_hmac_secret_from_integration_settings"
os.environ["DELIVERECT_WEBHOOK_SECRET"] = SECRET

from main import app  # noqa: E402

client = TestClient(app)
HEADER = "x-server-authorization-hmac-sha256"


def sign(body, secret=SECRET) -> str:
    data = body.encode() if isinstance(body, str) else body
    return hmac.new(secret.encode(), data, hashlib.sha256).hexdigest()


def post(path, body, signature="auto"):
    headers = {"content-type": "application/json"}
    if signature == "auto":
        signature = sign(body)
    if signature is not None:
        headers[HEADER] = signature
    return client.post(path, content=body, headers=headers)


@pytest.fixture(autouse=True)
def secret_env(monkeypatch):
    monkeypatch.setenv("DELIVERECT_WEBHOOK_SECRET", SECRET)


class TestSignatureVerification:
    body = json.dumps({"orderId": "o-1", "status": 20})

    def test_accepts_valid_signature(self):
        res = post("/webhooks/deliverect/order_status_update", self.body)
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_uppercase_hex(self):
        assert post("/webhooks/deliverect", self.body, sign(self.body).upper()).status_code == 200

    def test_rejects_missing_header(self):
        assert post("/webhooks/deliverect", self.body, None).status_code == 401

    def test_rejects_empty_header(self):
        assert post("/webhooks/deliverect", self.body, "").status_code == 401

    def test_rejects_wrong_signature(self):
        assert post("/webhooks/deliverect", self.body, "a" * 64).status_code == 401

    def test_rejects_other_secret(self):
        assert post("/webhooks/deliverect", self.body, sign(self.body, "other")).status_code == 401

    def test_rejects_tampered_body(self):
        assert post("/webhooks/deliverect", self.body.replace("20", "30"), sign(self.body)).status_code == 401

    def test_rejects_prefixed_digest(self):
        assert post("/webhooks/deliverect", self.body, f"sha256={sign(self.body)}").status_code == 401

    def test_rejects_wrong_length(self):
        assert post("/webhooks/deliverect", self.body, sign(self.body)[:62]).status_code == 401
        assert post("/webhooks/deliverect", self.body, sign(self.body) + "00").status_code == 401

    def test_rejects_non_hex(self):
        assert post("/webhooks/deliverect", self.body, sign(self.body)[:62] + "zz").status_code == 401

    def test_rejects_trailing_newline(self):
        # re.fullmatch (unlike $) must not accept a digest followed by a newline
        assert post("/webhooks/deliverect", self.body, sign(self.body) + "\n").status_code == 401

    def test_rejects_non_ascii_header_without_error(self):
        headers = {"content-type": "application/json", HEADER.encode(): "é".encode("latin-1") * 64}
        res = client.post("/webhooks/deliverect", content=self.body, headers=headers)
        assert res.status_code == 401

    def test_verifies_exact_bytes(self):
        spaced = '{ "orderId": "o-1",  "status": 20 }'
        assert post("/webhooks/deliverect", spaced, sign(spaced)).status_code == 200
        assert post("/webhooks/deliverect", spaced, sign(self.body)).status_code == 401

    def test_rejects_when_no_secret_configured(self, monkeypatch):
        monkeypatch.delenv("DELIVERECT_WEBHOOK_SECRET")
        assert post("/webhooks/deliverect", self.body, sign(self.body, "")).status_code == 401


class TestMethods:
    def test_signed_get_with_no_body(self):
        res = client.get("/webhooks/deliverect", headers={HEADER: sign("")})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_get_without_signature(self):
        assert client.get("/webhooks/deliverect").status_code == 401

    def test_get_signed_over_other_content(self):
        assert client.get("/webhooks/deliverect", headers={HEADER: sign("{}")}).status_code == 401

    def test_signed_get_on_kind_route(self):
        assert client.get("/webhooks/deliverect/menu_update", headers={HEADER: sign("")}).status_code == 200

    @pytest.mark.parametrize("method", ["PUT", "PATCH", "DELETE"])
    def test_other_methods(self, method):
        body = json.dumps({"status": "PAUSED"})
        res = client.request(
            method, "/webhooks/deliverect/busy_mode", content=body,
            headers={"content-type": "application/json", HEADER: sign(body)},
        )
        assert res.status_code == 200

    def test_any_content_type(self):
        body = '{"orderId":"o-2"}'
        res = client.post("/webhooks/deliverect", content=body, headers={"content-type": "text/plain", HEADER: sign(body)})
        assert res.status_code == 200


class TestWebhookKinds:
    def test_order_status_update(self, capsys):
        post("/webhooks/deliverect/order_status_update", json.dumps({"orderId": "o-9", "status": 50}))
        assert "Order o-9 status: 50" in capsys.readouterr().out

    def test_menu_update(self, capsys):
        post("/webhooks/deliverect/menu_update", json.dumps({"menus": [{}, {}]}))
        assert "Menu update with 2 menu(s)" in capsys.readouterr().out

    def test_snooze_unsnooze(self, capsys):
        body = json.dumps({"operations": [{"action": "snooze", "data": {"items": [{"plu": "a"}]}}]})
        post("/webhooks/deliverect/snooze_unsnooze", body)
        assert 'Snooze operation "snooze" for 1 item(s)' in capsys.readouterr().out

    def test_busy_mode_with_hyphen(self, capsys):
        post("/webhooks/deliverect/busy-mode", json.dumps({"status": "PAUSED"}))
        assert "Busy mode: PAUSED" in capsys.readouterr().out

    def test_unrecognised_kind(self, capsys):
        res = post("/webhooks/deliverect/something_else", json.dumps({"hello": "world"}))
        assert res.status_code == 200
        assert "Unhandled Deliverect call: something_else" in capsys.readouterr().out


class TestUntrustedBody:
    def test_invalid_json(self):
        assert post("/webhooks/deliverect", "{not json").status_code == 400

    @pytest.mark.parametrize("body", ["[1,2]", '"text"', "42", "null"])
    def test_non_object_json(self, body):
        assert post("/webhooks/deliverect", body).status_code == 400

    @pytest.mark.parametrize(
        "kind,payload",
        [
            ("order_status_update", {"orderId": 5, "status": {"a": 1}}),
            ("order_status_update", {"orderId": "o", "status": True}),
            ("menu_update", {"menus": "nope"}),
            ("snooze_unsnooze", {"operations": "x"}),
            ("snooze_unsnooze", {"operations": [None, 7, {"action": 3, "data": "y"}, {"action": "snooze", "data": {"items": 5}}]}),
            ("busy_mode", {"status": ["PAUSED"]}),
        ],
    )
    def test_wrong_typed_fields_do_not_fail(self, kind, payload):
        assert post(f"/webhooks/deliverect/{kind}", json.dumps(payload)).status_code == 200


def test_health():
    assert client.get("/health").status_code == 200
