# Generated with: currents-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_currents_request(headers, secret=None, header_name=None) -> bool:
    """Currents does not sign payloads. You add a secret custom header to the HTTP
    Webhook integration; the header name is yours, so it comes from
    CURRENTS_WEBHOOK_HEADER (default Authorization). The WHOLE header value is
    compared with CURRENTS_WEBHOOK_SECRET: no "Bearer " parsing.

    A static credential authenticates the sender, not the body, and gives no replay
    protection. The unsigned x-timestamp header can be forged, so it is not checked.
    """
    secret = secret if secret is not None else os.environ.get("CURRENTS_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("CURRENTS_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_currents_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_currents_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_event(payload: dict) -> None:
    event = payload.get("event")
    run_url = payload.get("runUrl")
    build_id = payload.get("buildId")
    group_id = payload.get("groupId")

    if event == "RUN_START":
        print(f"Run started: {build_id} {run_url}")
        # TODO: post a "tests running" status

    elif event == "RUN_FINISH":
        group = f" ({group_id})" if group_id else ""
        print(f"Run finished: {build_id}{group} {run_url}")
        # TODO: notify a channel or update a PR (payload["passes"], payload["failures"], payload["flaky"])

    elif event == "RUN_TIMEOUT":
        print(f"Run timed out: {build_id} {run_url}")
        # TODO: alert on the stuck CI job

    elif event == "RUN_CANCELED":
        print(f"Run canceled: {build_id} {run_url}")
        # TODO: clear the pending status (counters are a snapshot)

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/currents", dependencies=[Depends(require_currents_credential)])
async def currents_webhook(request: Request):
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
        print(f"Error handling Currents event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
