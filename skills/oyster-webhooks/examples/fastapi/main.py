# Generated with: oyster-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_oyster_request(headers, config=os.environ) -> bool:
    """Oyster does not sign payloads. The only authentication is the sharedSecret you
    registered, sent as `Authorization: Bearer <sharedSecret>`. Compare the WHOLE header
    value, "Bearer " prefix included; don't strip or parse it. A static credential
    authenticates the sender, not the body, and gives no replay protection, so use
    HTTPS, dedupe on the event id and rotate the secret if it leaks.
    """
    expected = config.get("OYSTER_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


async def require_oyster_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_oyster_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(event: dict) -> None:
    event_name = event["eventName"]
    data = event.get("data") or {}

    if event_name == "hiring.employment_engaged":
        print(f"Employment engaged: engagement {data.get('engagementId')}")
        # TODO: mark the hire as engaged in your system

    elif event_name == "expenses.expense_approved":
        print(
            f"Expense {data.get('expenseId')} approved "
            f"({data.get('previousReviewState')} -> {data.get('reviewState')})"
        )
        # TODO: reimburse or book the expense

    elif event_name == "contract.change_applied":
        print(
            f"Contract change {data.get('engagementChangeId')} applied "
            f"({data.get('changeType')}, {data.get('state')})"
        )
        # TODO: sync the updated contract terms

    elif event_name == "benefits.enrollment_enrolled":
        print(
            f"Benefits enrollment {data.get('enrollmentId')} enrolled "
            f"for engagement {data.get('engagementId')}"
        )
        # TODO: record the enrollment

    else:
        print(f"Unhandled Oyster event: {event_name}")


@app.post("/webhooks/oyster", dependencies=[Depends(require_oyster_auth)])
async def oyster_webhook(request: Request):
    # Read the raw body so any content type works.
    raw_body = await request.body()

    try:
        event = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(event, dict) or not isinstance(event.get("eventName"), str):
        raise HTTPException(status_code=400, detail="Expected a JSON object with an eventName")

    # Oyster may deliver the same webhook more than once: dedupe on event["id"] (wh_...)
    # in your own store before doing real work.
    try:
        handle_event(event)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Oyster webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # Oyster needs a 200 within 5 seconds.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
