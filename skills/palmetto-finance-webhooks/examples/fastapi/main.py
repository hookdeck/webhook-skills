# Generated with: palmetto-finance-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Each Palmetto Finance subscription sets its own httpMethod, so accept all of these.
METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison: compare_digest on equal-length SHA-256 digests (bytes)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_palmetto_finance_request(headers, secret=None, header_name=None) -> bool:
    """Palmetto Finance does not sign payloads. With the default server API key
    authentication, every delivery carries the key Palmetto returned at registration
    in a header (apiKey by default; some pages show api_key). We compare the WHOLE
    header value, with no 'Bearer ' parsing, which is what Hookdeck's source does.
    Starlette headers are case-insensitive.
    """
    secret = secret if secret is not None else os.environ.get("PALMETTO_FINANCE_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("PALMETTO_FINANCE_WEBHOOK_HEADER") or "apiKey"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)
    return bool(received) and safe_equal(received, secret)


async def require_palmetto_finance_key(request: Request) -> None:
    """FastAPI dependency: reject the request, for every method, before the body is read."""
    if not verify_palmetto_finance_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing API key header")


EVENT_LABELS = {
    "accountCreated": "Account created",
    "accountUpdated": "Account updated",
    "sendInvite": "Consumer application invite sent",
    "applicationStatus": "Application status changed",
    "contractApproved": "Contract approved",
    "contractSending": "Contract sending",
    "contractSent": "Contract sent",
    "contractSigned": "Contract signed",
    "contractVoided": "Contract voided",
    "contractReinstated": "Contract reinstated",
    "documentStatus": "Document status changed",
    "documentUploaded": "Document uploaded",
    "milestonePackage": "Milestone package",
    "milestoneAchieved": "Milestone achieved",
    "milestoneStatusChanged": "Milestone status changed",
    "quoteCreated": "Quote created",
    "quoteVoided": "Quote voided",
    "requirementStatusChanged": "Requirement status changed",
    "requirementCompleted": "Requirement completed",
    "termsAndConditionsAccepted": "Terms and conditions accepted",
    "allConsumerTaskEvents": "Consumer task",  # check status and activityType
}


def handle_event(payload: dict) -> None:
    event = payload.get("event")
    account_id = payload.get("accountId")
    label = EVENT_LABELS.get(event)

    if event == "accountCreated":
        print(f"{label}: {account_id} ({payload.get('programType')})")
        # TODO: create the account in your system (payload["accountReference"])

    elif event == "applicationStatus":
        print(f"{label}: {account_id} application {payload.get('applicationId')}")
        # TODO: update the application record (payload["applicants"])

    elif event == "contractSigned":
        print(f"{label}: {account_id} contract {payload.get('contractReference')}")
        # TODO: mark the contract signed (payload["quoteReference"])

    elif event == "milestoneAchieved":
        print(f"{label}: {payload.get('newMilestone')}")
        # TODO: advance the project (payload["organizationId"])

    elif event == "quoteCreated":
        print(f"{label}: {account_id} quote {payload.get('quoteId')}")
        # TODO: store the quote

    elif event == "documentUploaded":
        print(f"{label}: {account_id} document {payload.get('documentId')}")
        # TODO: fetch the document

    elif label:
        print(f"{label}: {account_id}")

    else:
        print(f"Unhandled event: {event}")


@app.api_route(
    "/webhooks/palmetto-finance",
    methods=METHODS,
    dependencies=[Depends(require_palmetto_finance_key)],
)
async def palmetto_finance_webhook(request: Request):
    # Read the raw body so any content type is accepted (GET and DELETE may have none).
    raw_body = await request.body()
    if not raw_body.strip():
        return {"received": True}

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Palmetto Finance event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
