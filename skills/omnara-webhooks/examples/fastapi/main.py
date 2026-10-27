# Generated with: omnara-webhooks skill
# https://github.com/hookdeck/webhook-skills

import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from standardwebhooks.webhooks import Webhook, WebhookVerificationError

load_dotenv()

app = FastAPI(title="Omnara Webhook Handler")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.post("/webhooks/omnara")
async def omnara_webhook(request: Request):
    # Fail closed: never accept deliveries when no secret is configured
    secret = os.environ.get("OMNARA_WEBHOOK_SECRET")
    if not secret:
        print("OMNARA_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Server configuration error")

    # Read the webhook-* headers; when webhook-id is absent, fall back to the svix-* headers
    prefix = "webhook" if request.headers.get("webhook-id") else "svix"
    msg_id = request.headers.get(f"{prefix}-id")
    timestamp = request.headers.get(f"{prefix}-timestamp")
    signature = request.headers.get(f"{prefix}-signature")
    if not (msg_id and timestamp and signature):
        # Omnara only signs when event_webhook.signing_secret_id is set on the agent
        raise HTTPException(status_code=400, detail="Missing required webhook headers")

    # Verify the RAW body: the exact bytes Omnara signed, whatever the content type
    raw_body = await request.body()
    try:
        # On success verify() returns the parsed JSON body, so there is no second parse.
        # Checks HMAC-SHA256 over "{id}.{timestamp}.{body}" against every v1, entry and enforces
        # a fixed 5-minute timestamp window (see references/verification.md to change that).
        # The library strips a whsec_ prefix if present, otherwise base64-decodes the whole secret.
        payload = Webhook(secret).verify(
            raw_body,
            {
                "webhook-id": msg_id,
                "webhook-timestamp": timestamp,
                "webhook-signature": signature,
            },
        )
    except json.JSONDecodeError:
        # The signature was valid but the body is not JSON
        raise HTTPException(status_code=400, detail="Invalid JSON")
    except (WebhookVerificationError, ValueError) as err:
        # A malformed signature entry can raise a plain ValueError
        print(f"Omnara webhook verification failed: {err}")
        detail = "Timestamp too old" if "timestamp" in str(err).lower() else "Invalid signature"
        raise HTTPException(status_code=400, detail=detail)

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # Body: {event, data}. `event` is the event type; timeline events repeat it in data.event_kind.
    # Webhook-Id is stable across retries: deduplicate on it (and tool calls on data.tool_call_id).
    event = payload.get("event")
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    interaction = data.get("interaction_update") if isinstance(data.get("interaction_update"), dict) else {}
    print(f"Received Omnara webhook {msg_id}: {event}")

    if event == "agent_input":
        print(f"Agent input: {data.get('agent_id')} {data.get('input_kind')} {data.get('turn_id')}")
    elif event == "model_output":
        print(f"Model output: {data.get('agent_id')} {data.get('stop_reason')} {data.get('turn_id')}")
    elif event == "tool_result":
        print(f"Tool result: {data.get('tool_call_id')} {data.get('outcome')}")
    elif event == "context_checkpoint":
        print(
            f"Context checkpoint: {data.get('context_checkpoint_id')} "
            f"{data.get('summarized_through_event_sequence')}"
        )
    elif event == "tool_call_update":
        # A notification to fetch the tool call: state snapshot only, no arguments.
        # For custom tool execution handle `ready` and deduplicate by tool_call_id.
        print(f"Tool call update: {data.get('tool_call_id')} {data.get('state')} {interaction.get('state')}")
    else:
        # Return 2xx for events you don't handle, or Omnara keeps retrying them
        print(f"Unhandled event type: {event}")

    return {"success": True, "event": event}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
