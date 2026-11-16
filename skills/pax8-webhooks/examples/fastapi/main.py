# Generated with: pax8-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes. Encode both sides: compare_digest raises
    TypeError when given a str containing non-ASCII characters."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_pax8_request(headers, config=os.environ) -> bool:
    """Pax8 does not sign payloads. It sends the `authorization` value you set on the
    webhook back in the `Authorization` header exactly as entered. Compare the WHOLE
    header value, including any "Bearer " or "Basic " prefix: don't strip, parse or
    base64-decode it. This authenticates the sender only; it gives no body integrity
    or replay protection.
    """
    expected = config.get("PAX8_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


def classify(payload: dict) -> dict:
    """Pax8's Webhooks API reference types a delivery as WebhookPayload: accountId, url,
    webhookId, sentAt, webhookTopic ({id, topic, filters}) and payloadData. The topic
    name is webhookTopic.topic. payloadData varies by topic and isn't documented, so
    treat the notification as a prompt to fetch current state from the Pax8 API."""
    wt = payload.get("webhookTopic")
    raw_topic = wt.get("topic") if isinstance(wt, dict) else None
    topic = raw_topic.upper() if isinstance(raw_topic, str) and raw_topic else None
    sent_at = payload.get("sentAt") if isinstance(payload.get("sentAt"), str) else None
    return {"topic": topic, "sentAt": sent_at}


async def require_pax8_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_pax8_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(payload: dict) -> None:
    event = classify(payload)
    topic, sent_at = event["topic"], event["sentAt"]

    # SUBSCRIPTION, INVOICE and PRODUCT are topic values printed in Pax8's docs. Read the
    # client, quote and user topic strings from GET /webhooks/topic-definitions.
    if topic == "SUBSCRIPTION":
        print(f"Pax8 subscription notification sent at {sent_at}")
        # Fetch the subscription from the Pax8 API and update your system.

    elif topic == "INVOICE":
        print(f"Pax8 invoice notification sent at {sent_at}")
        # Fetch the invoice from the Pax8 API and import it into billing.

    elif topic == "PRODUCT":
        print(f"Pax8 product notification sent at {sent_at}")
        # Refresh the product in your catalog cache.

    else:
        print(f"Pax8 notification for topic {topic or '(none)'}")


@app.post("/webhooks/pax8", dependencies=[Depends(require_pax8_auth)])
async def pax8_webhook(request: Request):
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
        print(f"Error handling Pax8 webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # Pax8 marks a delivery failed after 10 seconds: acknowledge quickly.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
