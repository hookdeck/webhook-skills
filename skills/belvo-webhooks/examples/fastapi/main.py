# Generated with: belvo-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises on non-ASCII str."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_belvo_request(headers, config=os.environ) -> bool:
    """Belvo does not sign payloads. The only authentication is the optional static
    `Authorization` header you configured on the webhook ("Bearer <token>" or
    "Basic <base64>"). Compare the WHOLE header value, scheme prefix included; don't
    strip or parse it. This proves who sent the request, not that the body is
    untampered, and gives no replay protection.
    """
    expected = config.get("BELVO_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


def classify(payload: dict):
    """Belvo body shapes, told apart by the fields present:
    - Payments Mexico: eventType/eventCode/details
    - Payments Brazil V2 (resources created with X-Belvo-API-Resource-Version: Payments-BR.V2):
      schema_version/resource/resource_id
    - Payments Brazil V1: webhook_type/webhook_code with object_id (no link_id)
    - Aggregation: webhook_type/webhook_code with link_id"""
    if isinstance(payload.get("eventCode"), str):
        return {"family": "payments_mx", "code": payload["eventCode"]}
    if isinstance(payload.get("schema_version"), str) and isinstance(payload.get("resource"), str):
        return {"family": "payments_br_v2", "code": payload["resource"], "id": payload.get("resource_id")}
    if isinstance(payload.get("webhook_code"), str):
        family = "payments_br_v1" if "object_id" in payload and "link_id" not in payload else "aggregation"
        return {"family": family, "code": payload["webhook_code"], "type": payload.get("webhook_type")}
    return None


async def require_belvo_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_belvo_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_payments(code: str, payload: dict) -> None:
    details = payload.get("details") or {}

    if code == "payment_request_successful":
        print(f"Payment request {details.get('id')} succeeded: {details.get('amount')}")
        # TODO: mark the payment as paid

    elif code == "payment_request_failed":
        print(f"Payment request {details.get('id')} failed: {details.get('failedReason')}")
        # TODO: notify the customer and retry or cancel

    elif code == "payment_request_chargeback":
        print(f"Payment request {details.get('id')} charged back")
        # TODO: flag the payment and the customer for review

    elif code in (
        "consent_submitted",
        "consent_confirmed",
        "consent_incomplete_information",
        "consent_rejected",
    ):
        print(f"Consent {details.get('id')} ({code}), payment method {details.get('paymentMethodId')}")
        # TODO: update the consent state; details.reasons lists files that failed validation

    elif code in (
        "payment_method_registration_successful",
        "payment_method_registration_failed",
        "payment_method_registration_canceled",
    ):
        print(f"Payment method {details.get('id')}: {code}")
        # TODO: activate or discard the payment method

    elif code in ("customer_blocked", "customer_unblocked"):
        # Sent to every merchant, so the customer may not exist in your system
        print(f"Customer {code} for document {details.get('documentNumber')}")
        # TODO: check your own customers for this documentNumber

    elif code == "withdrawal_created":
        print(f"Withdrawal {details.get('id')}: {details.get('fromDatetime')} to {details.get('toDatetime')}")
        # TODO: reconcile the settlement period

    else:
        print(f"Unhandled Belvo payments event: {code}")


def handle_aggregation(code: str, payload: dict) -> None:
    label = f"{payload.get('webhook_type')} {code} (link {payload.get('link_id')})"
    errors = (payload.get("data") or {}).get("errors")

    if isinstance(errors, list) and errors:
        print(f"Belvo aggregation error for {label}: {errors[0].get('code')}")
        # TODO: surface the error; operational_limits_reached means retry later
        return

    if code in (
        "historical_update",
        "new_accounts_available",
        "new_transactions_available",
        "transactions_updated",
        "transactions_deleted",
    ):
        print(f"Belvo data ready: {label}")
        # TODO: fetch the new data for this link_id from the Belvo API

    elif code in ("invalid_credentials", "token_required"):
        print(f"Belvo link needs the user to act: {label}")
        # TODO: ask the user to update the link

    elif code == "link_deleted":
        print(f"Belvo link deleted: {label}")
        # TODO: remove the stored link

    else:
        print(f"Unhandled Belvo aggregation event: {label}")


def handle_payments_brazil(kind: dict, payload: dict) -> None:
    # Brazil webhooks only identify the resource: fetch it from
    # GET /payments/br/{resource}/{id}/ (V2: send X-Belvo-API-Resource-Version: Payments-BR.V2).
    if kind["family"] == "payments_br_v2":
        print(f"Belvo Brazil {kind['code']} {kind['id']} updated at {payload.get('timestamp')}")
    else:
        data = payload.get("data") or {}
        print(f"Belvo Brazil {kind['type']} {kind['code']} for {payload.get('object_id')}: {data.get('status')}")
    # TODO: fetch the resource and update your records


def handle_event(payload: dict) -> None:
    kind = classify(payload)
    if kind is None:
        print("Unhandled Belvo payload (no eventCode, resource or webhook_code)")
    elif kind["family"] == "payments_mx":
        handle_payments(kind["code"], payload)
    elif kind["family"] in ("payments_br_v1", "payments_br_v2"):
        handle_payments_brazil(kind, payload)
    else:
        handle_aggregation(kind["code"], payload)


@app.post("/webhooks/belvo", dependencies=[Depends(require_belvo_auth)])
async def belvo_webhook(request: Request):
    # Read the raw body so any content type works.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Belvo webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
