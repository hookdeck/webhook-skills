import json
import os

# Set test environment variables before importing the app
AUTH = "k7Hq2mZp9XvT4rLb8NwY"
os.environ["ZOOP_AUTHORIZATION"] = AUTH

import pytest
from fastapi.testclient import TestClient

from main import app, process_event, seen, verify_zoop_request

client = TestClient(app)


def make_event(type_, id_=None, obj=None):
    id_ = id_ or f"evt_{type_}"
    return {
        "id": id_,
        "resource": "event",
        "type": type_,
        "source": "API",
        "payload": {"object": obj or {"id": "obj_1"}},
        "uri": f"/v1/marketplaces/mkt_1/events/{id_}",
        "created_at": "2015-06-17T20:12:25",
        "updated_at": "2015-06-18T07:45:02",
    }


# Shape follows Zoop's documented ping
PING = {
    "id": "ping_1",
    "type": "ping",
    "resource": "event",
    "payload": {"object": {"ping": "true"}},
    "source": None,
    "name": None,
    "uri": "/v1/marketplaces/mkt_1/events/evt_1",
    "created_at": "2020-04-01T18:21:33+0000",
    "updated_at": "2020-04-01T18:21:33+0000",
}


@pytest.fixture(autouse=True)
def reset_seen():
    seen.clear()


def post(body, headers=None, content_type="application/json"):
    data = body if isinstance(body, str) else json.dumps(body)
    return client.post(
        "/webhooks/zoop",
        content=data,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestAuthentication:
    def test_accepts_authorization_verbatim(self):
        res = post(make_event("transaction.succeeded"), {"Authorization": AUTH})
        assert res.status_code == 200
        assert res.json() == {"received": True}

    def test_accepts_ping(self, capsys):
        res = post(PING, {"Authorization": AUTH})
        assert res.status_code == 200
        assert "Zoop ping received" in capsys.readouterr().out

    def test_rejects_missing_header(self):
        assert post(PING).status_code == 401

    def test_rejects_wrong_value(self):
        assert post(PING, {"Authorization": "wrong-value"}).status_code == 401

    def test_compares_whole_header_without_stripping_bearer(self):
        assert post(PING, {"Authorization": f"Bearer {AUTH}"}).status_code == 401

    def test_non_ascii_header_does_not_raise(self):
        res = client.post(
            "/webhooks/zoop",
            content=json.dumps(PING),
            headers={"Authorization": "ação-inválida".encode("utf-8")},
        )
        assert res.status_code == 401

    def test_authenticates_regardless_of_content_type(self):
        assert post(json.dumps(PING), {"Authorization": AUTH}, "text/plain").status_code == 200

    def test_never_accepts_when_unconfigured(self):
        assert verify_zoop_request({"authorization": "x"}, {}) is False
        assert verify_zoop_request({"authorization": ""}, {"ZOOP_AUTHORIZATION": ""}) is False


class TestRequestHandling:
    def test_invalid_json_returns_400(self):
        assert post("not json", {"Authorization": AUTH}).status_code == 400

    def test_array_or_missing_type_returns_400(self):
        assert post("[1,2]", {"Authorization": AUTH}).status_code == 400
        assert post({"id": "x"}, {"Authorization": AUTH}).status_code == 400

    def test_only_post_is_allowed(self):
        assert client.get("/webhooks/zoop", headers={"Authorization": AUTH}).status_code == 405

    def test_processes_event_after_responding(self, capsys):
        post(make_event("transaction.failed", "evt_f", {"id": "tx_9"}), {"Authorization": AUTH})
        assert "Transaction tx_9 failed" in capsys.readouterr().out


class TestProcessEvent:
    @pytest.mark.parametrize(
        "type_,message",
        [
            ("transaction.succeeded", "Transaction obj_1 succeeded"),
            ("transaction.failed", "Transaction obj_1 failed"),
            ("transaction.canceled", "Transaction obj_1 canceled"),
            ("seller.activated", "Seller obj_1 activated"),
            ("bank_account.associated", "Bank account obj_1 associated"),
        ],
    )
    def test_dispatches(self, capsys, type_, message):
        assert process_event(make_event(type_)) == type_
        assert message in capsys.readouterr().out

    def test_unknown_type_does_not_fail(self, capsys):
        assert process_event(make_event("invoice.paid")) == "invoice.paid"
        assert "Unhandled Zoop event type: invoice.paid" in capsys.readouterr().out

    def test_dedupes_on_event_id(self, capsys):
        assert process_event(make_event("transaction.succeeded", "evt_dup")) == "transaction.succeeded"
        assert process_event(make_event("transaction.succeeded", "evt_dup")) == "duplicate"
        assert capsys.readouterr().out.count("succeeded") == 1
