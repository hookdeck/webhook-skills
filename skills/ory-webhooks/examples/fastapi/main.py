# Generated with: ory-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises TypeError on
    non-ASCII str, but accepts any bytes."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_ory_request(headers, secret=None, header_name=None) -> bool:
    """Ory does not sign webhooks. With auth.type api_key (in: header) it sends
    `<name>: <value>`, both chosen by you. Compare the WHOLE header value, including any
    "Bearer " prefix you typed. A static credential authenticates the sender, not the
    body, and gives no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("ORY_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("ORY_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    return bool(received) and safe_equal(received, secret)


async def require_ory_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_ory_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_event(payload: dict) -> None:
    # `event` comes from YOUR Jsonnet template; these names are the illustrative ones.
    event = payload.get("event")
    identity = payload.get("identity")
    identity_id = identity.get("id") if isinstance(identity, dict) else None

    if event == "registration.after":
        print(f"Identity registered: {identity_id}")
        # TODO: add the user to your CRM or newsletter

    elif event == "login.after":
        print(f"Identity logged in: {identity_id}")
        # TODO: record the sign-in

    elif event == "settings.after":
        print(f"Identity updated settings: {identity_id}")
        # TODO: sync updated traits

    elif event == "verification.after":
        print(f"Identity verified an address: {identity_id}")
        # TODO: mark the address as verified downstream

    elif event == "recovery.after":
        print(f"Identity recovered account: {identity_id}")
        # TODO: notify the user

    else:
        print(f"Unhandled event: {event}")


# Ory lets you pick the HTTP method for each action, so accept the useful ones.
@app.api_route(
    "/webhooks/ory",
    methods=["GET", "POST", "PUT", "PATCH"],
    dependencies=[Depends(require_ory_credential)],
)
async def ory_webhook(request: Request):
    # Read the raw body so any content type is accepted. The body is optional (GET has none).
    raw_body = await request.body()

    payload: object = {}
    if raw_body.strip():
        try:
            payload = json.loads(raw_body)
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(status_code=400, detail="Invalid JSON body")
        if not isinstance(payload, dict):
            raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Ory event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
