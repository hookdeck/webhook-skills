# Generated with: egnyte-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises on a
    str containing non-ASCII characters."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_egnyte_request(headers, config=os.environ) -> bool:
    """Egnyte does not sign payloads. It sends the `authHeader` configured at webhook
    registration as the `Authorization` header. Compare the complete header value,
    including any "Bearer " prefix; don't strip or parse it.
    """
    expected = config.get("EGNYTE_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


async def require_egnyte_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_egnyte_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(event: dict) -> None:
    event_type = event.get("eventType")
    data = event.get("data") or {}

    if event_type == "fs:add_file":
        print(f"File added: {data.get('targetPath')}")
        # TODO: sync the new file or version

    elif event_type == "fs:delete_file":
        print(f"File deleted: {data.get('targetPath')}")
        # TODO: remove the file from your cache

    elif event_type == "fs:move_file":
        print(f"File moved: {data.get('sourcePath')} -> {data.get('targetPath')}")
        # TODO: update stored paths

    elif event_type == "fs:add_folder":
        print(f"Folder added: {data.get('targetPath')}")

    elif event_type == "link:create":
        print(f"Link created by {(event.get('user') or {}).get('username')}")

    elif event_type == "comment:set_comment":
        print(f"Comment on {data.get('targetPath')}: {data.get('comment')}")

    elif event_type == "permission:permission_change":
        print(f"Permission change on {data.get('folderPath')}: {data.get('oldPrivilege')} -> {data.get('newPrivilege')}")

    elif event_type == "workflow:completed":
        print(f"Workflow completed: {(data.get('workflow') or {}).get('name')}")

    elif event_type == "group:add_members":
        print(f"Members added to group {data.get('groupName')}")

    else:
        # Still acknowledge with 200: any other status makes Egnyte retry and eventually disable the webhook.
        print(f"Unhandled Egnyte event: {event_type}")


@app.post("/webhooks/egnyte", dependencies=[Depends(require_egnyte_auth)])
async def egnyte_webhook(request: Request):
    # Read the raw body so any content type works.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise HTTPException(status_code=400, detail='Expected {"data": [...]}')

    try:
        # One request can carry several events. Dedupe on event["eventId"] in production.
        for event in payload["data"]:
            handle_event(event if isinstance(event, dict) else {})
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Egnyte webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # Egnyte expects exactly 200 (not 202/204).
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
