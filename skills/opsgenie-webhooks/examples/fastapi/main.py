# Generated with: opsgenie-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides to bytes: compare_digest raises
    TypeError on non-ASCII str, but accepts any bytes."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_opsgenie_request(headers, header_name=None, secret=None) -> bool:
    """Opsgenie does not sign webhooks. You add a custom header to the Webhook integration;
    the header name is yours to choose. Compare the WHOLE header value with the secret,
    exactly as typed in Opsgenie (a "Bearer " prefix, if you used one, is part of the value).
    This authenticates the sender, not the body, and gives no replay protection.
    """
    header_name = header_name or os.environ.get("OPSGENIE_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("OPSGENIE_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name.lower())  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_opsgenie_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_opsgenie_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_action(payload: dict) -> None:
    action = payload.get("action")
    alert = payload.get("alert") or {}
    alert_id = alert.get("alertId")

    if action == "Create":
        print(f"Alert created: {alert_id} {alert.get('message')}")
        # TODO: open a ticket or post to chat (alert["tags"], alert["teams"], alert["recipients"])

    elif action == "Acknowledge":
        print(f"Alert acknowledged: {alert_id}")
        # TODO: mark the ticket as in progress (alert["username"])

    elif action == "UnAcknowledge":
        print(f"Alert unacknowledged: {alert_id}")
        # TODO: reopen the ticket

    elif action == "AddNote":
        print(f"Note added: {alert_id}")
        # TODO: sync alert["note"] as a comment

    elif action == "AddTags":
        print(f"Tags added: {alert_id} {alert.get('addedTags')}")
        # TODO: sync alert["addedTags"] (comma-separated)

    elif action == "RemoveTags":
        print(f"Tags removed: {alert_id} {alert.get('removedTags')}")
        # TODO: sync alert["removedTags"] (comma-separated)

    elif action == "Close":
        print(f"Alert closed: {alert_id}")
        # TODO: resolve the ticket

    elif action == "AssignOwnership":
        print(f"Ownership assigned: {alert_id} -> {alert.get('owner')}")
        # TODO: assign the ticket to alert["owner"]

    elif action == "TakeOwnership":
        print(f"Ownership taken: {alert_id}")
        # TODO: assign the ticket to alert["username"]

    elif action == "Delete":
        print(f"Alert deleted: {alert_id}")
        # TODO: remove or archive the ticket

    elif action == "Escalate":
        # The Escalate payload carries only alert.alertId plus escalationName and escalationNotify.
        print(f"Alert escalated: {alert_id} ({payload.get('escalationName')})")
        # TODO: notify payload["escalationNotify"]

    elif action == "UpdatePriority":
        print(f"Priority updated: {alert_id} {alert.get('oldPriority')} -> {alert.get('priority')}")
        # TODO: sync alert["priority"]

    elif action == "UpdateDescription":
        print(f"Description updated: {alert_id}")
        # TODO: sync alert["description"]

    elif action == "UpdateMessage":
        print(f"Message updated: {alert_id}")
        # TODO: sync alert["message"]

    elif action == "AddTeam":
        print(f"Team added: {alert_id} {alert.get('team')}")
        # TODO: notify alert["team"]

    elif action == "AddRecipient":
        print(f"Recipient added: {alert_id} {alert.get('recipient')}")
        # TODO: notify alert["recipient"]

    else:
        # Custom alert actions send their own name as `action`.
        print(f"Custom or unhandled action: {action}")


@app.post("/webhooks/opsgenie", dependencies=[Depends(require_opsgenie_credential)])
async def opsgenie_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_action(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Opsgenie action: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
