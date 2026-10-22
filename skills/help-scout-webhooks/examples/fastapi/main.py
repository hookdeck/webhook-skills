import os
import hmac
import hashlib
import base64
import json
from dotenv import load_dotenv
from fastapi import FastAPI, Request, HTTPException

load_dotenv()

app = FastAPI()


def verify_helpscout_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify a Help Scout webhook signature.

    Help Scout sends the base64 HMAC-SHA1 of the raw body in X-HelpScout-Signature.
    """
    if not signature_header or not secret:
        return False

    expected = base64.b64encode(
        hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha1).digest()
    ).decode("utf-8")

    return hmac.compare_digest(signature_header.encode(), expected.encode())


@app.post("/webhooks/help-scout")
async def help_scout_webhook(request: Request):
    # Read the raw body for signature verification (do not use request.json())
    raw_body = await request.body()
    signature = request.headers.get("x-helpscout-signature")
    event = request.headers.get("x-helpscout-event")

    if not signature:
        raise HTTPException(status_code=400, detail="Missing signature header")

    # Read the secret per request so it can be rotated without a restart
    secret = os.environ.get("HELPSCOUT_WEBHOOK_SECRET")

    # Never return 410 here: Help Scout deletes the webhook on 410
    if not verify_helpscout_webhook(raw_body, signature, secret):
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Parse the payload only after verification
    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    print(f"Received {event} webhook")

    # The event name is in the X-HelpScout-Event header, not the body
    if event == "convo.created":
        print(f"Conversation created: {payload.get('id')} {payload.get('subject')}")
        # TODO: Create a ticket in another system, alert a channel, etc.

    elif event == "convo.assigned":
        print(f"Conversation assigned: {payload.get('id')}")
        # TODO: Notify the assignee, update routing, etc.

    elif event == "convo.status":
        print(f"Conversation status updated: {payload.get('id')} {payload.get('status')}")
        # TODO: Sync status, trigger follow-up on close, etc.

    elif event == "convo.customer.reply.created":
        print(f"Customer replied on conversation: {payload.get('id')}")
        # TODO: Escalate, reopen external tasks, etc.

    elif event == "convo.agent.reply.created":
        print(f"Agent replied on conversation: {payload.get('id')}")
        # TODO: Record response-time metrics, etc.

    elif event == "customer.created":
        print(f"Customer created: {payload.get('id')}")
        # TODO: Sync to CRM, etc.

    elif event == "customer.updated":
        print(f"Customer updated: {payload.get('id')}")
        # TODO: Keep profiles in sync, etc.

    elif event == "satisfaction.ratings":
        print(f"Satisfaction rating received: {payload.get('id')}")
        # TODO: Report CSAT, alert on low scores, etc.

    else:
        print(f"Unhandled event: {event}")

    # Any 2xx acknowledges receipt
    return {"status": "success"}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
