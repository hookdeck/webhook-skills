# Generated with: hasura-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_hasura_request(headers, name=None, secret=None) -> bool:
    """Hasura Event Triggers are not signed. You add a secret header to the trigger
    (Advanced settings > Headers); its name is yours to choose. We compare the WHOLE
    header value with HASURA_WEBHOOK_SECRET (no Bearer parsing). This authenticates the
    sender only: there is no body integrity and no replay protection.
    """
    name = name or os.environ.get("HASURA_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("HASURA_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_hasura_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_hasura_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook header")


def handle_event(payload: dict) -> None:
    event = payload["event"]
    table = payload.get("table") or {}
    trigger = payload.get("trigger") or {}
    where = f"{table.get('schema')}.{table.get('name')}"
    op = event["op"]

    if op == "INSERT":
        print(f"Row inserted into {where} (trigger {trigger.get('name')}, id {payload.get('id')})")
        # TODO: handle event["data"]["new"]

    elif op == "UPDATE":
        print(f"Row updated in {where} (trigger {trigger.get('name')}, id {payload.get('id')})")
        # TODO: compare event["data"]["old"] and event["data"]["new"]

    elif op == "DELETE":
        print(f"Row deleted from {where} (trigger {trigger.get('name')}, id {payload.get('id')})")
        # TODO: handle event["data"]["old"]

    elif op == "MANUAL":
        print(f"Manual invocation for {where} (trigger {trigger.get('name')}, id {payload.get('id')})")
        # TODO: handle event["data"]["new"]

    else:
        print(f"Unhandled op: {op}")


@app.post("/webhooks/hasura", dependencies=[Depends(require_hasura_header)])
async def hasura_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get("event"), dict)
        or not isinstance(payload["event"].get("op"), str)
    ):
        raise HTTPException(status_code=400, detail="Expected an Event Trigger payload with event.op")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Hasura event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
