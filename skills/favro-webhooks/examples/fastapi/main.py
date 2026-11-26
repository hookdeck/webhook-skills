# Generated with: favro-webhooks skill
# https://github.com/hookdeck/webhook-skills
import base64
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

load_dotenv()

app = FastAPI()

favro_secret = os.environ.get("FAVRO_WEBHOOK_SECRET")
favro_url = os.environ.get("FAVRO_WEBHOOK_URL")


def verify_favro_webhook(
    payload_id: str, webhook_url: str, secret: str, signature: str
) -> bool:
    """Verify a Favro webhook.

    Favro does NOT use Standard Webhooks. The signature is in the
    ``X-Favro-Webhook`` header and is computed over ``payload_id + webhook_url`` —
    NOT the request body:

        X-Favro-Webhook = base64( HMAC-SHA1( secret, payload_id + webhook_url ) )

    - payload_id  : the top-level string in the JSON body.
    - webhook_url : the postToUrl you registered, verbatim (FAVRO_WEBHOOK_URL).
    """
    if not (payload_id and webhook_url and secret and signature):
        return False

    digest = hmac.new(
        secret.encode("utf-8"),
        (payload_id + webhook_url).encode("utf-8"),
        hashlib.sha1,
    ).digest()
    expected = base64.b64encode(digest).decode("ascii")

    # Timing-safe compare.
    return hmac.compare_digest(expected, signature)


def event_key(body: dict) -> str:
    """Derive a ``<type>.<action>`` event key. Favro reuses the same ``action``
    across object types, so the type comes from which object the payload carries.
    Comment events carry the ``card`` too, so check ``comment`` first.
    """
    if body.get("action") == "ping":
        return "ping"
    if "comment" in body:
        obj_type = "comment"
    elif "card" in body:
        obj_type = "card"
    else:
        obj_type = "unknown"
    return f"{obj_type}.{body.get('action')}"


@app.post("/webhooks/favro")
async def favro_webhook(request: Request):
    # The signature is over payload_id + URL, not the body, so we read the body
    # only to extract payload_id and dispatch on the action.
    raw_body = await request.body()
    signature = request.headers.get("x-favro-webhook", "")

    try:
        body = json.loads(raw_body)
    except ValueError:
        return Response(content="Invalid JSON", status_code=400)

    # Verify before trusting anything in the payload.
    if not verify_favro_webhook(
        body.get("payloadId", ""), favro_url or "", favro_secret or "", signature
    ):
        return Response(content="Invalid signature", status_code=401)

    event = event_key(body)

    # The setup ping validates the endpoint — just acknowledge it.
    if event == "ping":
        print("Received Favro setup ping — endpoint validated")
        return {"status": "ok"}

    print(f"Received {event} (payloadId {body.get('payloadId')})")

    # Dispatch on the event. Return 200 quickly; do slow work asynchronously.
    if event == "card.created":
        pass  # Your code: sync the new card
    elif event == "card.committed":
        pass  # Your code: handle a card committed to this widget
    elif event == "card.moved":
        pass  # Your code: react to the card's new column
    elif event == "card.updated":
        pass  # Your code: keep your copy of the card in sync
    elif event == "card.deleted":
        pass  # Your code: remove your copy of the card
    elif event == "comment.created":
        pass  # Your code: handle the new comment
    elif event == "comment.updated":
        pass  # Your code: sync the edited comment
    elif event == "comment.deleted":
        pass  # Your code: remove your copy of the comment
    else:
        print(f"Unhandled event: {event}")

    # Favro expects a 200 for every event; repeated failures disable the webhook.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
