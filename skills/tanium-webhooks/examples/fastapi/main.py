# Generated with: tanium-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison: encode both sides to bytes (str would raise on
    non-ASCII) and compare equal-length digests."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_tanium_request(headers, secret=None, header_name=None) -> bool:
    """Tanium Connect does not sign requests. Header Authentication adds one header you
    name (Auth Header Name) with the value you chose (Secret). Header lookup is
    case-insensitive; compare the WHOLE value: no 'Bearer ' parsing or stripping.
    This is a static shared credential: it authenticates the sender, not the body,
    and gives no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("TANIUM_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("TANIUM_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)
    return bool(received) and safe_equal(received, secret)


async def require_tanium_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_tanium_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing authentication header")


def handle_records(payload) -> None:
    """The body is whatever the Connect connection is configured to send (the rows of
    its source, with the columns the author picked); there is no vendor event field.
    A batched run may be a JSON array of records, otherwise an object.
    """
    records = payload if isinstance(payload, list) else [payload]
    print(f"Received {len(records)} record(s) from Tanium Connect")
    # TODO: store or forward the records (e.g. records[0]["Computer Name"])


# The HTTP destination's method is user-chosen, so accept POST, PUT and PATCH.
@app.api_route(
    "/webhooks/tanium",
    methods=["POST", "PUT", "PATCH"],
    dependencies=[Depends(require_tanium_header)],
)
async def tanium_webhook(request: Request):
    # Read the raw body so any content type is accepted; an empty body is fine.
    raw_body = await request.body()

    payload = None
    if raw_body.strip():
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        if not isinstance(payload, (dict, list)):
            raise HTTPException(status_code=400, detail="Expected a JSON object or array")

    try:
        if payload is not None:
            handle_records(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Tanium delivery: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
