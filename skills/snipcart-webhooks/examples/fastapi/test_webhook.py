# Generated with: snipcart-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the Snipcart webhook receiver.

Snipcart does NOT sign webhooks, so there is no signature to generate here.
Verification is a network call to Snipcart's request-validation API, so every
test injects an ``httpx.MockTransport`` (no extra dependency, no network) and
asserts both the decision and the shape of the outbound call.
"""

import asyncio
import json
import os

import httpx
import pytest

TEST_SECRET_KEY = "SecretApiKeyForTests"
os.environ["SNIPCART_SECRET_API_KEY"] = TEST_SECRET_KEY

import main  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

client = TestClient(main.app, raise_server_exceptions=False)

# Observed Snipcart tokens are UUIDs.
TOKEN = "252e5ce5-7450-4ab4-bcda-57f1e7f6a51d"
EXPECTED_URL = f"{main.VALIDATION_ENDPOINT}/{TOKEN}"
EXPECTED_AUTH = main.basic_auth_header(TEST_SECRET_KEY)

ORDER_COMPLETED = {
    "eventName": "order.completed",
    "mode": "Test",
    "createdOn": "2026-09-28T14:03:11.000Z",
    "content": {
        "token": "a1b2c3d4-0000-1111-2222-333344445555",
        "invoiceNumber": "SNIP-1042",
        "email": "customer@example.com",
        "status": "InProgress",
        "paymentStatus": "Paid",
        "currency": "usd",
        "grandTotal": 120.5,
        "finalGrandTotal": 120.5,
        "items": [{"uniqueId": "i1", "name": "Blue widget", "totalPrice": 100, "quantity": 1}],
        "shippingAddress": {"country": "US", "postalCode": "90210"},
        "totalWeight": 500,
    },
}


class Recorder:
    """Captures the outbound validation request made through the mock transport."""

    def __init__(self):
        self.requests = []

    @property
    def called(self):
        return len(self.requests) > 0


@pytest.fixture(autouse=True)
def reset_env():
    os.environ["SNIPCART_SECRET_API_KEY"] = TEST_SECRET_KEY
    yield
    main.TRANSPORT = None
    os.environ["SNIPCART_SECRET_API_KEY"] = TEST_SECRET_KEY


def mock_validation(status: int) -> Recorder:
    """Install a MockTransport that answers the validation call with `status`."""
    recorder = Recorder()

    def handler(request: httpx.Request) -> httpx.Response:
        recorder.requests.append(request)
        return httpx.Response(status, json={"token": TOKEN, "resource": "/webhooks/snipcart"})

    main.TRANSPORT = httpx.MockTransport(handler)
    return recorder


def mock_network_error(exc: Exception) -> Recorder:
    recorder = Recorder()

    def handler(request: httpx.Request) -> httpx.Response:
        recorder.requests.append(request)
        raise exc

    main.TRANSPORT = httpx.MockTransport(handler)
    return recorder


def post(payload, token=TOKEN, path="/webhooks/snipcart"):
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["X-Snipcart-RequestToken"] = token
    body = payload if isinstance(payload, str) else json.dumps(payload)
    return client.post(path, content=body, headers=headers)


# --- request token validation ------------------------------------------------


def test_accepts_the_webhook_when_snipcart_returns_200():
    mock_validation(200)
    res = post(ORDER_COMPLETED)

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/json")
    assert res.json() == {"received": True}


def test_calls_the_exact_validation_url_with_basic_auth_and_no_redirects():
    recorder = mock_validation(200)
    post(ORDER_COMPLETED)

    assert len(recorder.requests) == 1
    request = recorder.requests[0]
    assert str(request.url) == EXPECTED_URL
    assert request.method == "GET"
    assert request.headers["authorization"] == EXPECTED_AUTH
    assert request.headers["accept"] == "application/json"
    # follow_redirects=False is set on the client, so only a direct 200 counts.
    assert request.extensions.get("timeout", {}).get("connect") == 5


def test_basic_credential_is_base64_of_key_colon():
    import base64

    assert main.basic_auth_header("secret") == "Basic " + base64.b64encode(b"secret:").decode()
    assert main.basic_auth_header("secret") != "Basic " + base64.b64encode(b"secret").decode()


def test_rejects_with_401_when_snipcart_returns_404():
    mock_validation(404)
    res = post(ORDER_COMPLETED)

    assert res.status_code == 401
    assert res.json()["reason"] == "unknown_token"


def test_rejects_with_401_when_snipcart_returns_401():
    mock_validation(401)
    res = post(ORDER_COMPLETED)

    assert res.status_code == 401
    assert res.json()["reason"] == "validation_unauthorized"


def test_fails_closed_on_a_500_from_snipcart():
    mock_validation(500)
    res = post(ORDER_COMPLETED)

    assert res.status_code == 401
    assert res.json()["reason"] == "upstream_error"


def test_does_not_treat_a_redirect_as_success():
    mock_validation(302)
    res = post(ORDER_COMPLETED)

    assert res.status_code == 401


def test_rejects_a_missing_header_without_calling_snipcart():
    recorder = mock_validation(200)
    res = post(ORDER_COMPLETED, token=None)

    assert res.status_code == 401
    assert res.json()["reason"] == "missing_token"
    assert not recorder.called


def test_rejects_an_empty_header_without_calling_snipcart():
    recorder = mock_validation(200)
    res = post(ORDER_COMPLETED, token="   ")

    assert res.status_code == 401
    assert res.json()["reason"] == "missing_token"
    assert not recorder.called


@pytest.mark.parametrize(
    "bad_token", ["..", "../orders", "a/b", "token?x=1", "tok en", "tok.en", "%2e%2e"]
)
def test_rejects_malicious_tokens_without_calling_snipcart(bad_token):
    recorder = mock_validation(200)
    res = post(ORDER_COMPLETED, token=bad_token)

    assert res.status_code == 401
    assert res.json()["reason"] == "malformed_token"
    assert not recorder.called


def test_fails_closed_on_a_network_error():
    mock_network_error(httpx.ConnectError("connection refused"))
    res = post(ORDER_COMPLETED)

    assert res.status_code == 401
    assert res.json()["reason"] == "upstream_unreachable"


def test_fails_closed_on_a_timeout():
    mock_network_error(httpx.ReadTimeout("timed out"))
    res = post(ORDER_COMPLETED)

    assert res.status_code == 401
    assert res.json()["reason"] == "upstream_unreachable"


def test_returns_500_when_the_secret_key_is_unset():
    recorder = mock_validation(200)
    del os.environ["SNIPCART_SECRET_API_KEY"]
    res = post(ORDER_COMPLETED)

    assert res.status_code == 500
    assert res.json() == {"error": "server_misconfigured"}
    assert not recorder.called


def test_validate_request_token_raises_without_a_key():
    recorder = mock_validation(200)
    del os.environ["SNIPCART_SECRET_API_KEY"]

    with pytest.raises(main.SnipcartConfigurationError, match="SNIPCART_SECRET_API_KEY"):
        asyncio.run(main.validate_request_token(TOKEN))
    assert not recorder.called


# --- payload handling --------------------------------------------------------


def test_returns_400_for_an_unparsable_body():
    mock_validation(200)
    res = post("not json")

    assert res.status_code == 400
    assert res.json() == {"error": "invalid_json"}


def test_returns_400_when_event_name_is_missing():
    mock_validation(200)
    res = post({"mode": "Test", "content": {}})

    assert res.status_code == 400
    assert res.json() == {"error": "missing_event_name"}


def test_handles_order_status_changed_with_top_level_from_to():
    mock_validation(200)
    res = post(
        {
            "eventName": "order.status.changed",
            "mode": "Live",
            "createdOn": "2026-09-28T14:10:00.000Z",
            "from": "InProgress",
            "to": "Shipped",
            "content": {"token": ORDER_COMPLETED["content"]["token"]},
        }
    )

    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_handles_the_v3_prefixed_subscription_events():
    mock_validation(200)
    res = post(
        {
            "eventName": "v3/subscription.invoice.payment.succeeded",
            "mode": "Live",
            "createdOn": "2026-09-28T14:20:00.000Z",
            "content": {
                "order": {"token": "order-token"},
                "subscription": {
                    "id": "sub_123",
                    "state": "Active",
                    "nextBillingDate": "2026-10-28T00:00:00.000Z",
                    "card": {"last4": "4242", "brand": "Visa"},
                },
            },
        }
    )

    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_acknowledges_unknown_event_names():
    mock_validation(200)
    res = post(
        {
            "eventName": "order.somethingNew",
            "mode": "Live",
            "createdOn": "2026-09-28T14:30:00.000Z",
            "content": {"token": "x", "aFieldAddedWithoutNotice": True},
        }
    )

    assert res.status_code == 200
    assert res.json() == {"received": True}


# --- synchronous webhooks ----------------------------------------------------


def test_shipping_rates_returns_a_rates_array():
    mock_validation(200)
    res = post(
        {
            "eventName": "shippingrates.fetch",
            "mode": "Test",
            "createdOn": "2026-09-28T14:40:00.000Z",
            "content": ORDER_COMPLETED["content"],
        },
        path="/webhooks/snipcart/shipping-rates",
    )

    assert res.status_code == 200
    assert res.headers["content-type"].startswith("application/json")
    rates = res.json()["rates"]
    assert isinstance(rates, list) and rates
    for rate in rates:
        assert isinstance(rate["cost"], (int, float))
        assert isinstance(rate["description"], str)
    assert len({rate["userDefinedId"] for rate in rates}) == len(rates)


def test_shipping_rates_reads_the_documented_flat_address_fields():
    mock_validation(200)
    # Shape of the documented shippingrates.fetch example: flat
    # shippingAddress* fields, no nested shippingAddress object.
    res = post(
        {
            "eventName": "shippingrates.fetch",
            "mode": "Live",
            "createdOn": "2015-02-21T14:58:02.6738454Z",
            "content": {
                "token": "22808196-0eff-4a6e-b136-3e4d628b3cf5",
                "currency": "USD",
                "shippingAddressCountry": "CA",
                "shippingAddressProvince": "QC",
                "shippingAddressPostalCode": "G1G 1G1",
                "totalWeight": 20.0,
                "items": [{"id": "1", "name": "Movie", "price": 300.0, "quantity": 1, "weight": 10.0}],
            },
        },
        path="/webhooks/snipcart/shipping-rates",
    )

    assert res.status_code == 200
    body = res.json()
    assert "errors" not in body
    assert body["rates"]


def test_shipping_rates_returns_a_customer_facing_error_as_2xx():
    mock_validation(200)
    content = dict(ORDER_COMPLETED["content"], shippingAddress={})
    res = post(
        {
            "eventName": "shippingrates.fetch",
            "mode": "Test",
            "createdOn": "2026-09-28T14:40:00.000Z",
            "content": content,
        },
        path="/webhooks/snipcart/shipping-rates",
    )

    assert res.status_code == 200
    body = res.json()
    assert body["errors"][0]["key"] == "invalid_shipping_address"
    assert "rates" not in body


def test_taxes_returns_a_taxes_array_in_currency_units():
    mock_validation(200)
    res = post(
        {
            "eventName": "taxes.calculate",
            "mode": "Test",
            "createdOn": "2026-09-28T14:45:00.000Z",
            "content": {
                "token": "cart-token",
                "currency": "usd",
                "items": [{"totalPrice": 100}, {"totalPrice": 50}],
            },
        },
        path="/webhooks/snipcart/taxes",
    )

    assert res.status_code == 200
    taxes = res.json()["taxes"]
    assert taxes[0]["name"] == "Sales tax"
    assert taxes[0]["amount"] == 7.5
    assert taxes[0]["rate"] == 0.05


def test_synchronous_webhooks_validate_the_token_too():
    mock_validation(404)
    res = post(
        {
            "eventName": "taxes.calculate",
            "mode": "Test",
            "createdOn": "2026-09-28T14:45:00.000Z",
            "content": {"items": []},
        },
        path="/webhooks/snipcart/taxes",
    )

    assert res.status_code == 401
