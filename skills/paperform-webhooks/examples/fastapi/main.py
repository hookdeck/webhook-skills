# Generated with: paperform-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_paperform_request(
    headers, header_name: Optional[str] = None, secret: Optional[str] = None
) -> bool:
    """Paperform does not sign payloads. Authenticate with a secret custom header added to the
    webhook (Custom headers toggle). The header name is user-chosen, and the whole header value
    is compared (no Bearer parsing). A static credential authenticates the sender, not the body,
    and gives no replay protection: use HTTPS and rotate it if it leaks.
    """
    header_name = header_name or os.environ.get("PAPERFORM_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("PAPERFORM_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # compare_digest on bytes: encode both sides (str raises TypeError on non-ASCII)
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_paperform_secret(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_paperform_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_submission(payload: dict, trigger: str) -> None:
    """Paperform has no event types: the trigger (New Submission or Partial Submission) is a
    per-webhook setting. This example reads an optional ?trigger=new|partial query parameter
    that you add to the webhook URL yourself.
    """
    submission_id = payload.get("submission_id")
    answers = {q.get("custom_key") or q.get("key"): q.get("value") for q in payload["data"]}

    if trigger == "partial":
        print(f"Partial submission {submission_id}", answers)
        # TODO: follow up on the abandoned form
    else:
        print(f"New submission {submission_id}", answers)
        # TODO: create a record, notify a team (payload["charge"] is set for payments)


@app.post("/webhooks/paperform", dependencies=[Depends(require_paperform_secret)])
async def paperform_webhook(request: Request, trigger: str = "new"):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        raise HTTPException(status_code=400, detail="Expected a JSON object with a data array")

    try:
        handle_submission(payload, "partial" if trigger == "partial" else "new")
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Paperform submission: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
