import os

os.environ.setdefault("MOLLIE_API_KEY", "test_dummy")

import httpx
import pytest
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


# --- Handler tests: monkeypatch fetch_payment so we never hit the real API. ---
# Mollie webhooks are unsigned; the form body carries only an `id`. The handler
# must fetch the payment and act on the AUTHORITATIVE status it returns.


def test_missing_id_returns_400(monkeypatch):
    async def should_not_run(_payment_id):
        raise AssertionError("fetch_payment should not be called")

    monkeypatch.setattr(main, "fetch_payment", should_not_run)
    res = client.post("/webhooks/mollie", data={})
    assert res.status_code == 400


def test_fetches_by_body_id_and_ignores_body_status(monkeypatch):
    seen = {}

    async def fake(payment_id):
        seen["id"] = payment_id
        return {"id": payment_id, "status": "paid", "amount": {"currency": "EUR", "value": "10.00"}}

    monkeypatch.setattr(main, "fetch_payment", fake)
    # Even if an attacker sends status=paid, we ignore it and fetch.
    res = client.post("/webhooks/mollie", data={"id": "tr_abc123", "status": "ignored"})
    assert res.status_code == 200
    assert seen["id"] == "tr_abc123"


def test_unknown_id_returns_200(monkeypatch):
    async def fake(_payment_id):
        return None  # unknown/deleted id

    monkeypatch.setattr(main, "fetch_payment", fake)
    res = client.post("/webhooks/mollie", data={"id": "tr_unknown"})
    assert res.status_code == 200


def test_fetch_failure_returns_500(monkeypatch):
    async def fake(_payment_id):
        raise httpx.ConnectError("network down")

    monkeypatch.setattr(main, "fetch_payment", fake)
    res = client.post("/webhooks/mollie", data={"id": "tr_transient"})
    assert res.status_code == 500


@pytest.mark.parametrize(
    "status",
    ["open", "pending", "authorized", "paid", "canceled", "expired", "failed", "some_future_status"],
)
def test_handles_each_status(monkeypatch, status):
    async def fake(payment_id):
        return {"id": payment_id, "status": status, "amount": {"currency": "EUR", "value": "10.00"}}

    monkeypatch.setattr(main, "fetch_payment", fake)
    res = client.post("/webhooks/mollie", data={"id": f"tr_{status}"})
    assert res.status_code == 200
    assert res.text == "OK"


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


# --- fetch_payment tests: exercise the real REST logic with a mock transport. ---


def _mock_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.anyio
async def test_fetch_payment_returns_dict_on_200():
    def handler(request):
        assert request.url.path == "/v2/payments/tr_abc123"
        assert request.headers["authorization"] == "Bearer test_dummy"
        return httpx.Response(200, json={"id": "tr_abc123", "status": "paid"})

    async with _mock_client(handler) as c:
        payment = await main.fetch_payment("tr_abc123", client=c)
    assert payment == {"id": "tr_abc123", "status": "paid"}


@pytest.mark.anyio
async def test_fetch_payment_returns_none_on_404():
    def handler(request):
        return httpx.Response(404, json={"status": 404, "detail": "No payment exists"})

    async with _mock_client(handler) as c:
        payment = await main.fetch_payment("tr_missing", client=c)
    assert payment is None


@pytest.mark.anyio
async def test_fetch_payment_raises_on_500():
    def handler(request):
        return httpx.Response(503, text="upstream error")

    async with _mock_client(handler) as c:
        with pytest.raises(httpx.HTTPStatusError):
            await main.fetch_payment("tr_boom", client=c)


@pytest.fixture
def anyio_backend():
    return "asyncio"
