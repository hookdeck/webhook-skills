import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_notion_signature(
    raw_body: bytes, signature_header: str | None, verification_token: str | None
) -> bool:
    """Verify a Notion webhook signature.

    Notion sends ``X-Notion-Signature: sha256=<hex>`` where the hex is the
    HMAC-SHA256 of the raw request body, keyed with the verification_token
    captured during the one-time handshake.
    """
    if not signature_header or not verification_token:
        return False

    expected = "sha256=" + hmac.new(
        verification_token.encode("utf-8"), raw_body, hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(expected, signature_header)


@app.post("/webhooks/notion")
async def notion_webhook(request: Request):
    raw_body = await request.body()
    signature = request.headers.get("x-notion-signature")
    token = os.environ.get("NOTION_VERIFICATION_TOKEN")

    # Handshake: the first delivery to a new subscription has no signature
    # and the body is { "verification_token": "secret_..." }. Surface it so
    # the developer can paste it into the Notion UI to activate the
    # subscription.
    if not signature:
        try:
            data = json.loads(raw_body)
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON body")

        if isinstance(data, dict) and isinstance(data.get("verification_token"), str):
            print(
                "Notion verification_token (paste this into the Notion UI):",
                data["verification_token"],
            )
            return {"received": True}

        raise HTTPException(status_code=400, detail="Missing X-Notion-Signature")

    if not verify_notion_signature(raw_body, signature, token):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    event_type = event.get("type")
    entity_id = (event.get("entity") or {}).get("id")
    print(f"Received {event_type} (id: {event.get('id')})")

    if event_type == "page.content_updated":
        print("Page content updated:", entity_id)
        # TODO: re-index the page, sync content, etc.

    elif event_type == "page.properties_updated":
        print("Page properties updated:", entity_id)
        # TODO: react to status changes, recompute derived fields, etc.

    elif event_type == "page.created":
        print("Page created:", entity_id)

    elif event_type == "page.deleted":
        print("Page deleted:", entity_id)

    elif event_type == "page.locked":
        print("Page locked:", entity_id)

    elif event_type == "page.moved":
        print("Page moved:", entity_id)

    elif event_type == "comment.created":
        print("Comment created:", entity_id)

    elif event_type == "data_source.schema_updated":
        print("Data source schema updated:", entity_id)

    else:
        print(f"Unhandled event type: {event_type}")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3000)
