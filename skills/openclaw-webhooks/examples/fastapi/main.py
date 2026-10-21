# Generated with: openclaw-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hmac
import json
import os
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_openclaw_webhook(authorization_header: Optional[str], webhook_token: Optional[str]) -> bool:
    """Verify an OpenClaw automation (cron) webhook.

    OpenClaw docs: "`webhookToken` is sent as `Authorization: Bearer <token>` on
    automation webhook POSTs." The body is not signed, so the header is the whole
    check. Compare the entire header value with "Bearer <webhookToken>" in constant
    time, the same way Hookdeck's OpenClaw source does.
    """
    if not authorization_header or not webhook_token:
        return False
    return hmac.compare_digest(
        authorization_header.encode("utf-8"), f"Bearer {webhook_token}".encode("utf-8")
    )


def handle_openclaw_payload(payload: Dict[str, Any]) -> str:
    """Finished event: {"action": "finished", "jobId", "runId", "status", ...}.
    Failure alert (delivery.failureDestination in webhook mode): {"jobId", "jobName", "message", "runAtMs"}.

    Field names come from OpenClaw's source (commit 5dc91d6), not its docs:
    https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/cron/service/state.ts#L53-L76
    https://github.com/openclaw/openclaw/blob/5dc91d677c85706878087ccd6e003dbddc75fe45/src/gateway/server-cron-notifications.ts#L463-L468
    """
    if payload.get("action") == "finished":
        name = (payload.get("job") or {}).get("name") or payload.get("jobId")
        if payload.get("status") == "error" or payload.get("completionStatus") == "failed":
            print(f'Automation "{name}" failed (run {payload.get("runId")}): {payload.get("error") or "unknown error"}')
        else:
            print(f'Automation "{name}" finished (run {payload.get("runId")}): {payload.get("summary") or ""}')
        return "finished"
    if payload.get("jobId") and isinstance(payload.get("message"), str):
        print(f'Failure alert for "{payload.get("jobName") or payload.get("jobId")}": {payload["message"]}')
        return "failure_alert"
    print("Unhandled OpenClaw payload")
    return "unknown"


# OpenClaw automation webhook endpoint (set with `openclaw automations create ... --webhook <url>`)
@app.post("/webhooks/openclaw")
async def openclaw_webhook(request: Request):
    webhook_token = os.environ.get("OPENCLAW_WEBHOOK_TOKEN")
    if not webhook_token:
        print("OPENCLAW_WEBHOOK_TOKEN is not set")
        raise HTTPException(status_code=500, detail="Webhook token not configured")

    if not verify_openclaw_webhook(request.headers.get("authorization"), webhook_token):
        print("OpenClaw webhook verification failed")
        raise HTTPException(status_code=401, detail="Invalid token")

    # Read the raw body, then parse JSON only after the token check passes
    raw_body = await request.body()
    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON")

    # OpenClaw records delivery on any 2xx and does not retry an ambiguous send.
    # A relay such as Hookdeck can retry, so dedupe on runId (or jobId + runAtMs) in production.
    kind = handle_openclaw_payload(payload)
    return {"received": True, "kind": kind}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
