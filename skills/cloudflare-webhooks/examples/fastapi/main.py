# Generated with: cloudflare-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Cloudflare Notifications webhook receiver.

CLOUDFLARE NOTIFICATIONS WEBHOOK AUTHENTICATION

Cloudflare does NOT sign generic webhooks: no HMAC, no timestamp. The secret you
enter when creating the webhook (Alerts -> Destinations -> Webhooks) is sent
verbatim in the `cf-webhook-auth` header of every request. Reject the request if
the header is missing or isn't your value.
"""

import hmac
import json
import os
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI(title="Cloudflare Webhook Receiver")


def verify_cloudflare_auth(header: Optional[str], secret: Optional[str]) -> bool:
    """Constant-time compare of the cf-webhook-auth header against the secret."""
    if not header or not secret:
        return False
    return hmac.compare_digest(header.encode("utf-8"), secret.encode("utf-8"))


def event_name(payload: Any) -> str:
    """The event name is the payload's `alert_type`.

    The dashboard's "Save and Test" message carries only `text`, so it has no
    alert_type: treat it as "test".
    """
    if isinstance(payload, dict) and isinstance(payload.get("alert_type"), str) and payload["alert_type"]:
        return payload["alert_type"]
    return "test"


async def require_cloudflare_auth(request: Request) -> None:
    """FastAPI dependency: authenticate the cf-webhook-auth header."""
    secret = os.environ.get("CLOUDFLARE_WEBHOOK_SECRET")
    if not secret:
        # Fail closed on misconfiguration: 500, distinguishable from a bad credential.
        print("CLOUDFLARE_WEBHOOK_SECRET is not set - refusing unauthenticated webhooks")
        raise HTTPException(status_code=500, detail="Webhook authentication not configured")

    header = request.headers.get("cf-webhook-auth")
    if not header:
        raise HTTPException(status_code=401, detail="Missing cf-webhook-auth header")

    if not verify_cloudflare_auth(header, secret):
        raise HTTPException(status_code=401, detail="Invalid cf-webhook-auth header")


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/webhooks/cloudflare", dependencies=[Depends(require_cloudflare_auth)])
async def cloudflare_webhook(request: Request):
    # Authenticated by the dependency; parse only now.
    try:
        payload = json.loads(await request.body())
    except (ValueError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    policy_id = payload.get("policy_id") if isinstance(payload, dict) else None
    print(f"Authenticated Cloudflare webhook: {event_name(payload)} ({policy_id or 'no policy_id'})")

    handle_event(payload)
    return {"received": True}


def handle_event(payload: Any) -> None:
    # Cloudflare sends no event ID. alert_correlation_id groups the START/END
    # pair of one incident (alert_event), so dedupe on
    # alert_correlation_id + alert_event + ts if you need idempotency.
    if not isinstance(payload, dict):
        print("Ignoring non-object payload")
        return
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    alert_event = payload.get("alert_event")
    state = f" [{alert_event}]" if alert_event else ""
    name = event_name(payload)

    if name == "advanced_ddos_attack_l4_alert":
        print(f"L4 DDoS attack on {data.get('target_ip')}{state}")
    elif name == "advanced_ddos_attack_l7_alert":
        print(f"L7 DDoS attack on {data.get('target_hostname')}{state}")
    elif name == "dedicated_ssl_certificate_event_type":
        print(f"SSL certificate event for {data.get('hostnames')}{state}")
    elif name == "health_check_status_notification":
        print(
            f"Health check {data.get('health_check_name')}: "
            f"{data.get('old_status')} -> {data.get('new_status')}{state}"
        )
    elif name == "workers_alert":
        print(f"Workers usage alert: {payload.get('text')}{state}")
    elif name == "workers_observability_alert":
        config = data.get("config") if isinstance(data.get("config"), dict) else {}
        print(f"Workers observability alert: {config.get('name')}{state}")
    elif name == "access_custom_certificate_expiration_type":
        print(
            f"Access certificate for {data.get('hostnames')} expires in "
            f"{data.get('days_til_expiration')} days{state}"
        )
    elif name == "test":
        # Sent by "Save and Test" in the dashboard.
        print(f"Test message: {payload.get('text')}")
    else:
        print(f"Unhandled Cloudflare alert_type: {name} - {payload.get('text')}{state}")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
