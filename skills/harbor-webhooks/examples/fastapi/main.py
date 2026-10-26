# Generated with: harbor-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()

# CloudEvents format: reverse-DNS types map to the Default format's type names.
CLOUDEVENTS_TYPES = {
    "harbor.artifact.pushed": "PUSH_ARTIFACT",
    "harbor.artifact.pulled": "PULL_ARTIFACT",
    "harbor.artifact.deleted": "DELETE_ARTIFACT",
    "harbor.scan.completed": "SCANNING_COMPLETED",
    "harbor.scan.stopped": "SCANNING_STOPPED",
    "harbor.scan.failed": "SCANNING_FAILED",
    "harbor.quota.exceeded": "QUOTA_EXCEED",
    "harbor.quota.warned": "QUOTA_WARNING",
    "harbor.replication.status.changed": "REPLICATION",
    "harbor.tag_retention.finished": "TAG_RETENTION",
}


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison. Encode both sides: compare_digest raises on a str
    with non-ASCII characters, but accepts any bytes."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_harbor_request(headers, config=os.environ) -> bool:
    """Harbor does not sign payloads. If you set an Auth Header on the webhook, Harbor
    sends it verbatim as the Authorization header. Compare the WHOLE header value to
    HARBOR_AUTHORIZATION (e.g. "Bearer <token>"); don't strip, parse or decode the prefix.
    """
    expected = config.get("HARBOR_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


def normalize(payload: dict):
    """Both payload formats carry a `type`. Default: {type, occur_at, operator,
    event_data}. CloudEvents: {specversion, id, type, time, data, operator}.
    Returns (event name, event data)."""
    event_type = payload.get("type")
    if not isinstance(event_type, str):
        return None, None
    if payload.get("specversion"):
        return CLOUDEVENTS_TYPES.get(event_type, event_type), payload.get("data")
    return event_type, payload.get("event_data")


async def require_harbor_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_harbor_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_event(payload: dict) -> None:
    event_type, data = normalize(payload)
    data = data if isinstance(data, dict) else {}
    repo = (data.get("repository") or {}).get("repo_full_name")

    if event_type == "PUSH_ARTIFACT":
        print(f"Artifact pushed to {repo}")
        # TODO: trigger a build or deployment for the pushed artifact

    elif event_type == "PULL_ARTIFACT":
        print(f"Artifact pulled from {repo}")

    elif event_type == "DELETE_ARTIFACT":
        print(f"Artifact deleted from {repo}")

    elif event_type == "SCANNING_COMPLETED":
        print(f"Scan completed for {repo}")
        # TODO: inspect scan_overview severity and gate promotion

    elif event_type == "SCANNING_STOPPED":
        print(f"Scan stopped for {repo}")

    elif event_type == "SCANNING_FAILED":
        print(f"Scan failed for {repo}")

    elif event_type == "QUOTA_EXCEED":
        print(f"Project quota exceeded at {repo}")
        # TODO: alert the project owners

    elif event_type == "QUOTA_WARNING":
        print(f"Project quota near threshold at {repo}")

    elif event_type == "REPLICATION":
        print(f"Replication status: {(data.get('replication') or {}).get('job_status')}")

    elif event_type == "TAG_RETENTION":
        print(f"Tag retention finished: {(data.get('retention') or {}).get('result')}")

    else:
        print(f"Unhandled Harbor event type: {event_type}")


@app.post("/webhooks/harbor", dependencies=[Depends(require_harbor_auth)])
async def harbor_webhook(request: Request):
    # Read the raw body so any content type works.
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
        print(f"Error handling Harbor webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
