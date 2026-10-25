# Generated with: streak-webhooks skill
# https://github.com/hookdeck/webhook-skills
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request
import hmac

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_streak_request(headers, token: Optional[str] = None) -> bool:
    """Streak does not sign payloads. If the webhook was created with a `token`, Streak
    sends it as plain text in the X-Streak-Webhook-Token header; compare the WHOLE value.
    A webhook created without a token sends nothing to verify.
    """
    token = token if token is not None else os.environ.get("STREAK_WEBHOOK_TOKEN")
    if not token:
        return False  # never accept when unconfigured
    received = headers.get("x-streak-webhook-token")
    return bool(received) and safe_equal(received, token)


async def require_streak_token(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_streak_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing X-Streak-Webhook-Token")


# Streak does not put the event name in the body, so register one URL per webhook:
# POST /webhooks/streak?event=BOX_CREATE
def handle_event(event: Optional[str], objects: list) -> None:
    n = len(objects)

    if event == "BOX_CREATE":
        print(f"Box created ({n})")
        # TODO: sync the new box (name, pipelineKey, stageKey)

    elif event == "BOX_EDIT":
        print(f"Box edited ({n})")
        # TODO: refresh custom fields, notes, assignees or name

    elif event == "BOX_CHANGE_STAGE":
        print(f"Box changed stage ({n})")
        # TODO: react to the new stageKey

    elif event == "BOX_CHANGE_PIPELINE":
        print(f"Box changed pipeline ({n})")

    elif event == "BOX_DELETE":
        print(f"Box deleted ({n})")
        # TODO: remove the box from your system

    elif event == "BOX_NEW_EMAIL_ADDRESS":
        print(f"Box got a new email address ({n})")

    elif event == "STAGE_CREATE":
        print(f"Stage created ({n})")

    elif event == "COMMENT_CREATE":
        print(f"Comment created ({n})")
        # TODO: mirror the comment

    elif event in ("MEETING_CREATE", "MEETING_UPDATE"):
        print(f"{event} ({n})")
        # TODO: sync the meeting note or call log

    elif event in ("TASK_CREATE", "TASK_COMPLETE", "TASK_DUE", "TASK_UPDATED"):
        print(f"{event} ({n})")
        # TODO: sync the task

    elif event in (
        "CONTACT_CREATE", "CONTACT_UPDATE", "CONTACT_DELETE",
        "ORG_CREATE", "ORG_UPDATE", "ORG_DELETE",
    ):
        print(f"{event} ({n})")
        # TODO: sync the contact or organization

    else:
        print(f"Unhandled event: {event or '(none, add ?event=NAME to the webhook URL)'}")


@app.post("/webhooks/streak", dependencies=[Depends(require_streak_token)])
async def streak_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Streak sends the updated object(s) in an array; tolerate a single object too.
    objects = payload if isinstance(payload, list) else [payload]
    if not all(isinstance(o, dict) for o in objects):
        raise HTTPException(status_code=400, detail="Expected a JSON object or array of objects")

    try:
        handle_event(request.query_params.get("event"), objects)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Streak event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    # Must be 200. 410 Gone deletes the webhook; anything else is retried with backoff.
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
