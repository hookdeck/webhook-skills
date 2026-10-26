# Generated with: hightouch-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# Each sync trigger (rows added / changed / removed) picks its own method and payload,
# and the trigger is not written into the request. A common convention maps the method
# back to the trigger; adjust it to match how you configured the sync.
TRIGGERS = {
    "POST": "row_added",
    "PUT": "row_changed",
    "PATCH": "row_changed",
    "DELETE": "row_removed",
}


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides to bytes: compare_digest raises on
    non-ASCII str."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_hightouch_request(headers, secret=None, header_name=None) -> bool:
    """Hightouch does not sign requests. The HTTP Request destination sends the header you
    configured (name is your choice), so authenticate by comparing that header's WHOLE
    value with HIGHTOUCH_WEBHOOK_SECRET. Do not strip or parse a "Bearer " prefix: the
    secret is whatever exact value you typed. Starlette headers are case-insensitive.

    A static shared credential authenticates the sender, not the body, and gives no replay
    protection. Use HTTPS and rotate the credential if it leaks.
    """
    secret = secret if secret is not None else os.environ.get("HIGHTOUCH_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("HIGHTOUCH_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    # Lower-case both sides so the lookup is case-insensitive for any mapping type.
    received = {k.lower(): v for k, v in headers.items()}.get(header_name.lower())
    return bool(received) and safe_equal(received, secret)


async def require_hightouch_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_hightouch_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing credential header")


def handle_request(method: str, payload) -> str:
    # With batching enabled the body is a list of rows (or a dict wrapping one).
    trigger = TRIGGERS.get(method, "unmapped")

    if trigger == "row_added":
        print(f"Rows added: {json.dumps(payload)}")
        # TODO: create the record(s) in your system

    elif trigger == "row_changed":
        print(f"Rows changed: {json.dumps(payload)}")
        # TODO: update the record(s)

    elif trigger == "row_removed":
        print(f"Rows removed: {json.dumps(payload)}")
        # TODO: delete the record(s)

    else:
        print(f"Unmapped {method} request: {json.dumps(payload)}")

    return trigger


# The HTTP Request destination supports GET, POST, PUT, PATCH and DELETE.
@app.api_route(
    "/webhooks/hightouch",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    dependencies=[Depends(require_hightouch_credential)],
)
async def hightouch_webhook(request: Request):
    # Read the raw body so any content type is accepted; it may be empty (e.g. GET).
    raw_body = await request.body()

    payload = None
    if raw_body.strip():
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")

    try:
        trigger = handle_request(request.method, payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Hightouch request: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True, "trigger": trigger}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
