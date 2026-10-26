# Generated with: youmail-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (never pass str: it raises on non-ASCII)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_youmail_request(headers, config=os.environ) -> bool:
    """YouMail does not sign payloads. When the webhook is created with auth "Bearer",
    YouMail is expected to send `Authorization: Bearer <token>` (not printed in its docs). Compare the WHOLE header value,
    including the "Bearer " prefix, with YOUMAIL_AUTHORIZATION. Don't strip or parse it.
    A static credential authenticates the sender only: it does not cover the body and
    gives no replay protection.
    """
    expected = config.get("YOUMAIL_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


def classify(payload: dict):
    """YouMail payloads have no envelope and no type field: each webhook is created
    for one eventType. Prefer one URL per webhook; otherwise detect by top-level keys."""
    if "callEvents" in payload:
        return "CALL_EVENT"
    if any(
        k in payload
        for k in (
            "callAttestationSummaries",
            "callCompletionSummaries",
            "callLabelSummaries",
            "callVolumeSummaries",
        )
    ):
        return "PHONE_INSIGHTS"
    if "tnReportUuid" in payload:
        return "PROVIDER_TN_REPORT_STATUS"
    # WATCHLIST_PHONE_SCORE_THRESHOLD (deprecated, no longer emitted) shares this shape
    if "phoneNumber" in payload and any(
        k in payload for k in ("oldSpamScore", "newSpamScore", "newFraudScore", "newUnlawfulScore")
    ):
        return "WATCHLIST_SCORE_THRESHOLD"
    return None


async def require_youmail_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_youmail_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(payload: dict) -> None:
    kind = classify(payload)

    if kind == "CALL_EVENT":
        events = payload["callEvents"]
        print(f"Call events: {len(events) if isinstance(events, list) else 1}")
        # TODO: store the call events (callEventUuid, callResult, originator, destination)

    elif kind == "PHONE_INSIGHTS":
        print("Phone insights summaries received")
        # TODO: process the *Summaries arrays

    elif kind == "PROVIDER_TN_REPORT_STATUS":
        print(f"TN report {payload.get('tnReportUuid')} ({payload.get('phoneNumber')}): {payload.get('status')}")
        # TODO: update the TN report status in your system

    elif kind == "WATCHLIST_SCORE_THRESHOLD":
        print(
            f"Score threshold for {payload.get('phoneNumber')}: "
            f"spam {payload.get('oldSpamScore')} -> {payload.get('newSpamScore')}"
        )
        # TODO: alert on the changed spam, unlawful or fraud scores

    else:
        print("Unhandled YouMail payload (unrecognized top-level keys)")


@app.post("/webhooks/youmail", dependencies=[Depends(require_youmail_auth)])
async def youmail_webhook(request: Request):
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
        print(f"Error handling YouMail webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
