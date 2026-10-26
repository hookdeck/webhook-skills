import hashlib
import hmac
import json
import os
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request


def _as_dict(value):
    """A nested JSON object, or {} when the field is missing or another type."""
    return value if isinstance(value, dict) else {}


load_dotenv()

app = FastAPI()

SHA256_HEX = re.compile(r"[0-9a-fA-F]{64}")


def verify_sonarqube_signature(
    raw_body: bytes, signature: Optional[str], secret: Optional[str]
) -> bool:
    """Verify a SonarQube webhook signature.

    SonarQube sends X-Sonar-Webhook-HMAC-SHA256 = bare lowercase hex of
    HMAC-SHA256(secret, raw_body). Only the raw body is signed.
    """
    if not signature or not secret or not SHA256_HEX.fullmatch(signature):
        return False

    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    # Encode both sides: compare_digest raises TypeError on non-ASCII str
    return hmac.compare_digest(expected.encode("utf-8"), signature.lower().encode("utf-8"))


def handle_analysis(payload: dict) -> None:
    """SonarQube has no event types: every delivery is an analysis result."""
    project = _as_dict(payload.get("project")).get("key")
    gate_status = _as_dict(payload.get("qualityGate")).get("status")

    if gate_status == "OK":
        print(f"Quality gate passed for {project} (task {payload.get('taskId')})")
        # TODO: Promote the build, post a success message
    elif gate_status == "ERROR":
        print(f"Quality gate failed for {project} (task {payload.get('taskId')})")
        # TODO: Block the deploy, notify the owner (see qualityGate.conditions)
    else:
        print(f"Analysis {payload.get('taskId')} for {project} has status {payload.get('status')}")


@app.post("/webhooks/sonarqube")
async def sonarqube_webhook(request: Request):
    secret = os.getenv("SONARQUBE_WEBHOOK_SECRET")
    if not secret:
        raise HTTPException(status_code=500, detail="Secret not configured")

    # Raw body for signature verification - don't use request.json() first
    raw_body = await request.body()
    signature = request.headers.get("x-sonar-webhook-hmac-sha256")
    if not verify_sonarqube_signature(raw_body, signature, secret):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Parse only after verification
    try:
        payload = json.loads(raw_body)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid JSON")
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # SonarQube never retries and times out after 10 seconds: respond fast
    handle_analysis(payload)

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}
