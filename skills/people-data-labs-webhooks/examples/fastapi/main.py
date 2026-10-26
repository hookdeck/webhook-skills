# Generated with: people-data-labs-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_pdl_request(headers, name=None, secret=None) -> bool:
    """PDL does not sign payloads. The webhook carries the header the PDL team was
    asked to add at registration. The header name is user-chosen; the expected value
    is the exact, whole header value (a "Bearer " prefix, if any, is part of it).
    A static credential authenticates the sender, not the body, and gives no replay
    protection, so use HTTPS and rotate the credential if it leaks.
    """
    name = name or os.environ.get("PEOPLE_DATA_LABS_WEBHOOK_HEADER") or "Authorization"
    secret = secret if secret is not None else os.environ.get("PEOPLE_DATA_LABS_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(name)  # request.headers is case-insensitive
    if not received:
        return False
    # compare_digest raises on non-ASCII str, so compare bytes
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_pdl_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_pdl_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook secret header")


def handle_event(ids: list) -> None:
    # The payload is a JSON array of PDL IDs (up to 1,000) for records updated in a release.
    print(f"Person record update batch: {len(ids)} ids")
    # TODO: dedupe (an ID repeats when several filters match), store the IDs,
    # then re-enrich them with the Person Enrichment API


@app.post("/webhooks/people-data-labs", dependencies=[Depends(require_pdl_header)])
async def people_data_labs_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, list) or not all(isinstance(i, str) for i in payload):
        raise HTTPException(status_code=400, detail="Expected a JSON array of PDL ids")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling People Data Labs batch: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
