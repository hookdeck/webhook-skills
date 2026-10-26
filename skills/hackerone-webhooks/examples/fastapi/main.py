# Generated with: hackerone-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os
import re

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

SIGNATURE_PREFIX = "sha256="
_HEX64 = re.compile(r"[0-9a-fA-F]{64}")


def verify_hackerone(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify X-H1-Signature: "sha256=" + hex HMAC-SHA256 of the raw body, keyed with the
    webhook secret (UTF-8 bytes, used as-is). Only the body is signed, so there is no
    timestamp to check. The bare digest is accepted too.
    """
    if not secret or not signature_header:
        return False
    digest = signature_header.strip()
    if digest.startswith(SIGNATURE_PREFIX):
        digest = digest[len(SIGNATURE_PREFIX):]
    # fullmatch (not "$"): validate length and alphabet before decoding.
    if not _HEX64.fullmatch(digest):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(digest), expected)


def _obj(value) -> dict:
    return value if isinstance(value, dict) else {}


def handle_event(event_name: str, body: dict) -> None:
    # Every field is untrusted: check the type of each level before reading into it.
    report = _obj(_obj(body.get("data")).get("report"))
    attrs = _obj(report.get("attributes"))
    report_id = report.get("id") if isinstance(report.get("id"), str) else "unknown"
    title = attrs.get("title") if isinstance(attrs.get("title"), str) else ""

    if event_name == "report_created":
        print(f"New report {report_id}: {title}")
        # TODO: create a ticket in your issue tracker

    elif event_name == "report_new":
        print(f"Report {report_id} needs program input")

    elif event_name == "report_triaged":
        print(f"Report {report_id} triaged")
        # TODO: assign an owner

    elif event_name == "report_bounty_awarded":
        print(f"Bounty awarded on report {report_id}")
        # TODO: record the payout

    elif event_name == "report_comment_created":
        print(f"Comment on report {report_id}")

    elif event_name == "report_resolved":
        print(f"Report {report_id} resolved")
        # TODO: close the linked ticket

    elif event_name in (
        "report_closed_as_duplicate",
        "report_closed_as_informative",
        "report_closed_as_spam",
        "report_closed_as_not_applicable",
    ):
        print(f"Report {report_id} closed: {event_name}")

    else:
        print(f"Unhandled HackerOne event: {event_name[:100]}")


@app.post("/webhooks/hackerone")
async def hackerone_webhook(request: Request):
    secret = os.environ.get("HACKERONE_WEBHOOK_SECRET")
    if not secret:
        print("HACKERONE_WEBHOOK_SECRET is not set")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # Raw bytes: verify exactly what was received, whatever the Content-Type.
    raw_body = await request.body()
    if not verify_hackerone(raw_body, request.headers.get("x-h1-signature"), secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # The event name is only in the X-H1-Event header.
    event_name = request.headers.get("x-h1-event")
    if not event_name:
        raise HTTPException(status_code=400, detail="Missing X-H1-Event header")

    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(event_name, body)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling HackerOne webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
