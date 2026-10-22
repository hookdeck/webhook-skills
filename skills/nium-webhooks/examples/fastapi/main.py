# Generated with: nium-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises on non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_nium_request(headers, secret=None, header_name=None) -> bool:
    """Nium does not sign payloads. During client setup Nium is told to add a static header
    to every webhook. The name is user-chosen (NIUM_WEBHOOK_HEADER, default x-partner-key)
    and the whole value is compared as-is: no 'Bearer ' parsing. This authenticates the
    sender only, not the body, and gives no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("NIUM_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("NIUM_WEBHOOK_HEADER") or "x-partner-key"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_nium_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_nium_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_event(payload: dict) -> None:
    # Most events name themselves in `template`. RFI events carry rfiDetails.status instead.
    rfi = payload.get("rfiDetails") or {}
    event = payload.get("template") or rfi.get("status")

    if event == "CUSTOMER_STATUS_WEBHOOK":
        print(f"Customer {payload.get('customerHashId')} status: {payload.get('status')}/{payload.get('subStatus')}")
        # TODO: update the customer's onboarding state; check payload["resubmissionAllowed"] on rejection

    elif event == "CUSTOMER_ODD_STATUS_WEBHOOK":
        print(f"Customer ODD status changed: {payload.get('customerHashId')}")
        # TODO: track ongoing due diligence

    elif event == "CARD_CLIENT_KYB_STATUS_WEBHOOK":
        print(f"Client KYB status: {payload.get('status')} ({payload.get('complianceStatus')})")
        # TODO: gate go-live on KYB completion

    elif event == "REMIT_TRANSACTION_INITIATED_WEBHOOK":
        print(f"Payout initiated: {payload.get('systemReferenceNumber')}")
        # TODO: mark the payout as in flight

    elif event == "REMIT_TRANSACTION_PAID_WEBHOOK":
        print(f"Payout paid: {payload.get('systemReferenceNumber')}")
        # TODO: mark the payout as settled

    elif event == "REMIT_TRANSACTION_REJECTED_WEBHOOK":
        print(f"Payout rejected: {payload.get('systemReferenceNumber')}")
        # TODO: release funds and notify the sender

    elif event == "REMIT_TRANSACTION_RETURNED_WEBHOOK":
        print(f"Payout returned: {payload.get('systemReferenceNumber')}")
        # TODO: refund the sender

    elif event == "FX_CONVERSION_COMPLETED_WEBHOOK":
        print(f"FX conversion completed: {payload.get('systemReferenceNumber')}")
        # TODO: update wallet balances

    elif event in ("FX_CONVERSION_FAILED_WEBHOOK", "FX_CONVERSION_CANCELLED_WEBHOOK"):
        print(f"FX conversion not completed ({event}): {payload.get('systemReferenceNumber')}")
        # TODO: alert and retry or release the quote

    elif event in ("CARD_POS_APPROVED_WEBHOOK", "CARD_ATM_APPROVED_WEBHOOK"):
        print(
            f"Card transaction approved ({event}): {payload.get('merchantName')} "
            f"{payload.get('transactionAmount')} {payload.get('transactionCurrency')}"
        )
        # TODO: record the authorization against payload["cardHashId"]

    elif event == "CARD_WALLET_FUNDING_WEBHOOK":
        print(f"Card wallet funded: {payload.get('walletHashId')}")
        # TODO: credit the customer's balance

    elif event == "VIRTUAL_ACCOUNT_ASSIGNED_WEBHOOK":
        print(f"Virtual account assigned: {payload.get('customerHashId')}")
        # TODO: show the new account details to the customer

    elif event == "INCOMING_FUNDS_WEBHOOK":
        print(f"Incoming funds: {payload.get('walletHashId')}")
        # TODO: reconcile the deposit

    elif event == "RFI_REQUESTED":
        print(f"RFI requested: {rfi.get('rfiId')}")
        # TODO: ask the customer to respond (rfi["query"])

    elif event == "RFI_RESPONDED":
        print(f"RFI responded: {rfi.get('rfiId')}")
        # TODO: mark the RFI as answered

    elif event == "RFI_CLOSED":
        print(f"RFI closed: {rfi.get('rfiId')}")
        # TODO: stop chasing the customer

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/nium", dependencies=[Depends(require_nium_credential)])
async def nium_webhook(request: Request):
    # Read the raw body so any content type is accepted.
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
        print(f"Error handling Nium event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # Nium treats anything other than 200 as a failed delivery.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
