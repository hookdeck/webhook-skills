# Generated with: honeybadger-webhooks skill
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
    """Constant-time string comparison (compare_digest on equal-length digests)."""
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def verify_honeybadger_request(headers, token=None) -> bool:
    """Honeybadger does not sign payloads. Every webhook carries a Honeybadger-Token
    header: a secret token derived from the project API key, sent raw with no prefix.
    (The optional Authorization: Bearer token is NOT what we check.)
    """
    token = token if token is not None else os.environ.get("HONEYBADGER_TOKEN")
    if not token:
        return False  # never accept when unconfigured
    received = headers.get("honeybadger-token")
    return bool(received) and safe_equal(received, token)


async def require_honeybadger_token(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_honeybadger_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Honeybadger-Token")


def handle_event(payload: dict) -> None:
    event = payload.get("event")
    message = payload.get("message")

    if event == "occurred":
        print(f"Error occurred: {message}")
        # TODO: page on-call or open a ticket (payload["fault"], payload["notice"])

    elif event == "resolved":
        print(f"Error resolved: {message}")
        # TODO: close the matching ticket

    elif event == "unresolved":
        print(f"Error reopened: {message}")
        # TODO: reopen the matching ticket

    elif event == "assigned":
        print(f"Error assigned: {message}")
        # TODO: notify payload["assignee"]

    elif event == "commented":
        print(f"Error commented: {message}")
        # TODO: sync payload["comment"]

    elif event == "rate_exceeded":
        print(f"Error rate exceeded: {message}")
        # TODO: escalate

    elif event == "volume_spike":
        print(f"Error volume spike: {message}")
        # TODO: escalate

    elif event == "deployed":
        print(f"Deploy recorded: {message}")
        # TODO: annotate dashboards with payload["deploy"]

    elif event == "down":
        print(f"Site down: {message}")
        # TODO: open an incident (payload["site"], payload["outage"])

    elif event == "up":
        print(f"Site back up: {message}")
        # TODO: resolve the incident

    elif event == "cert_will_expire":
        print(f"Certificate expiring: {message}")
        # TODO: schedule a renewal

    elif event == "check_in_missing":
        print(f"Check-in missing: {message}")
        # TODO: alert on the stalled job (payload["check_in"])

    elif event == "check_in_reporting":
        print(f"Check-in reporting: {message}")
        # TODO: clear the missing-check-in alert

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/honeybadger", dependencies=[Depends(require_honeybadger_token)])
async def honeybadger_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Honeybadger event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
