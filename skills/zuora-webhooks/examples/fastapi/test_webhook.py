import base64
import json
import os

# Set test environment variables before importing the app
os.environ["ZUORA_WEBHOOK_USERNAME"] = "zuora-callout"
os.environ["ZUORA_WEBHOOK_PASSWORD"] = "p@ss:w0rd:with:colons"

import pytest
from fastapi.testclient import TestClient

from main import app, parse_basic_auth, verify_zuora_request

client = TestClient(app)

USER = os.environ["ZUORA_WEBHOOK_USERNAME"]
PASS = os.environ["ZUORA_WEBHOOK_PASSWORD"]


def basic(user=USER, password=PASS, scheme="Basic"):
    token = base64.b64encode(f"{user}:{password}".encode("utf-8")).decode("ascii")
    return f"{scheme} {token}"


GOOD = basic()


def sample_payload(event="PaymentProcessed"):
    # Illustrative body: Zuora adds no event field, the callout template defines the body.
    return {"event": event, "accountId": "2c92c0f8-0000-0000-0000-000000000001", "invoiceNumber": "INV00000123"}


def call(method="POST", headers=None, body=None, content_type="application/json", url="/webhooks/zuora"):
    content = body if body is not None else json.dumps(sample_payload())
    return client.request(
        method,
        url,
        content=content,
        headers={"Content-Type": content_type, **(headers or {})},
    )


class TestBasicAuth:
    def test_accepts_correct_credentials(self):
        res = call(headers={"Authorization": GOOD})
        assert res.status_code == 200
        assert res.json() == {"received": True, "success": True}

    @pytest.mark.parametrize("scheme", ["basic", "BASIC"])
    def test_scheme_is_case_insensitive(self, scheme):
        assert call(headers={"Authorization": basic(scheme=scheme)}).status_code == 200

    def test_splits_on_first_colon(self):
        assert parse_basic_auth(GOOD) == (USER.encode(), PASS.encode())

    def test_accepts_non_ascii_password(self):
        headers = {"authorization": basic(USER, "pässwörd-日本")}
        assert verify_zuora_request(headers, USER, "pässwörd-日本") is True

    def test_non_ascii_mismatch_does_not_raise(self):
        headers = {"authorization": basic("üser", "pässwörd")}
        assert verify_zuora_request(headers, USER, PASS) is False

    def test_rejects_wrong_password(self):
        assert call(headers={"Authorization": basic(USER, "wrong")}).status_code == 401

    def test_rejects_wrong_username(self):
        assert call(headers={"Authorization": basic("someone-else", PASS)}).status_code == 401

    def test_rejects_both_wrong_with_different_lengths(self):
        assert call(headers={"Authorization": basic("x", "y")}).status_code == 401

    def test_rejects_missing_header_and_sends_challenge(self):
        res = call()
        assert res.status_code == 401
        assert res.headers["www-authenticate"].startswith("Basic")

    @pytest.mark.parametrize(
        "header",
        [
            "Basic",
            "Basic ",
            "Bearer " + base64.b64encode(f"{USER}:{PASS}".encode()).decode(),
            "Basic !!!not-base64!!!",
            "Basic " + base64.b64encode(b"no-colon-here").decode(),
            "Basic " + base64.b64encode(f"{USER}:{PASS}".encode()).decode() + " extra",
            f"{USER}:{PASS}",
        ],
    )
    def test_rejects_malformed_headers(self, header):
        assert call(headers={"Authorization": header}).status_code == 401

    def test_rejects_everything_when_unset(self):
        headers = {"authorization": GOOD}
        assert verify_zuora_request(headers, "", "") is False
        assert verify_zuora_request(headers, USER, "") is False
        assert verify_zuora_request(headers, "", PASS) is False

    def test_authenticates_before_parsing_body(self):
        assert call(body="{not json").status_code == 401


class TestMethods:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_accepts_methods_with_json_body(self, method):
        assert call(method, headers={"Authorization": GOOD}).status_code == 200

    def test_get_with_empty_body_reads_query(self, capsys):
        res = client.get(
            "/webhooks/zuora?event=InvoicePosted&accountId=abc", headers={"Authorization": GOOD}
        )
        assert res.status_code == 200
        assert "Invoice posted for account abc" in capsys.readouterr().out

    def test_post_with_no_body(self):
        res = client.post("/webhooks/zuora", headers={"Authorization": GOOD})
        assert res.status_code == 200

    def test_other_methods_get_405(self):
        res = client.options("/webhooks/zuora", headers={"Authorization": GOOD})
        assert res.status_code == 405


class TestBody:
    @pytest.mark.parametrize("ctype", ["text/plain", "application/octet-stream", "application/vnd.api+json"])
    def test_accepts_any_content_type(self, ctype):
        assert call(headers={"Authorization": GOOD}, content_type=ctype).status_code == 200

    def test_invalid_json_returns_400(self):
        assert call(headers={"Authorization": GOOD}, body="{not json").status_code == 400

    def test_non_object_json_returns_400(self):
        assert call(headers={"Authorization": GOOD}, body="[1,2]").status_code == 400

    @pytest.mark.parametrize("event", ["PaymentProcessed", "InvoicePosted", "SomethingElse"])
    def test_handles_events(self, event):
        res = call(headers={"Authorization": GOOD}, body=json.dumps(sample_payload(event)))
        assert res.status_code == 200


def test_health_needs_no_auth():
    assert client.get("/health").status_code == 200
