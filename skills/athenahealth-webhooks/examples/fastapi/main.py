# Generated with: athenahealth-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_athenahealth_webhook(raw_body: bytes, signature_header: str | None, secret: str | None) -> bool:
    """Verify X-Hub-Signature: "sha256=<hex>", an HMAC-SHA256 of the raw body keyed
    with the X-Hub-Secret sent when creating the FHIR Subscription (WebSub content
    signing). Only the sha256 method is accepted."""
    if not signature_header or not secret:
        return False

    method, _, sig = signature_header.partition("=")
    if method != "sha256" or not sig:
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Compare bytes: str arguments with non-ASCII characters raise TypeError (a 500)
    return hmac.compare_digest(sig.lower().encode("utf-8"), expected.encode("utf-8"))


def handle_event(topic: str, event: dict) -> None:
    """One call per notification event (a Bundle can batch several for one topic)."""
    focus_info = event.get("focus") or {}
    focus = focus_info.get("reference") or (focus_info.get("identifier") or {}).get("value")
    # TODO: dedupe on event["id"] (delivery is at-least-once), then GET the focus resource
    if topic == "Appointment.schedule":
        print(f"Appointment scheduled: {focus}")
    elif topic == "Appointment.cancel":
        print(f"Appointment cancelled: {focus}")
    elif topic == "Appointment.reschedule":
        print(f"Appointment rescheduled: {focus}")
    elif topic == "Appointment.check-in":
        print(f"Appointment checked in: {focus}")
    elif topic == "Appointment.update":
        print(f"Appointment updated: {focus}")
    elif topic == "Encounter.check-in":
        print(f"Encounter checked in: {focus}")
    elif topic == "Encounter.signoff":
        print(f"Encounter signed off: {focus}")
    elif topic == "LabResult.create":
        print(f"Lab result created: {focus}")
    elif topic == "LabResult.close":
        print(f"Lab result closed: {focus}")
    elif topic in ("Patient.create", "Patient.update"):
        print(f"{topic}: {focus}")
    else:
        print(f"Unhandled topic: {topic}")


@app.post("/webhooks/athenahealth")
async def athenahealth_webhook(request: Request):
    # Raw bytes: the signature covers the exact body sent
    raw_body = await request.body()
    signature = request.headers.get("x-hub-signature")

    if not signature:
        raise HTTPException(status_code=401, detail="Missing X-Hub-Signature header")

    if not verify_athenahealth_webhook(raw_body, signature, os.getenv("ATHENAHEALTH_WEBHOOK_SECRET")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification
    try:
        bundle = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # entry[0] is the SubscriptionStatus; its topic URL ends in the topic name
    if not isinstance(bundle, dict) or bundle.get("resourceType") != "Bundle":
        raise HTTPException(status_code=400, detail="Not a subscription notification Bundle")
    entries = bundle.get("entry")
    first = entries[0] if isinstance(entries, list) and entries else None
    status = first.get("resource") if isinstance(first, dict) else None
    if not isinstance(status, dict) or status.get("resourceType") != "SubscriptionStatus":
        raise HTTPException(status_code=400, detail="Not a subscription notification Bundle")

    topic = str(status.get("topic") or "").rsplit("/", 1)[-1]
    for event in status.get("notificationEvent") or []:
        handle_event(topic, event)

    # Acknowledge fast: athenahealth expects a 2xx within 2 seconds
    return {"received": True}
