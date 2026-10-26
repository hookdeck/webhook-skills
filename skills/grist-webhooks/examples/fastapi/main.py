# Generated with: grist-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest raises on non-ASCII str)."""
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def verify_grist_request(headers, config=os.environ) -> bool:
    """Grist does not sign payloads. The credential is the webhook's "Header
    Authorization" field, a static string sent verbatim as the Authorization header.
    GRIST_AUTHORIZATION is the whole value as typed in Grist (e.g. "Bearer <token>"):
    compare the complete header, never strip or decode the scheme prefix.
    """
    expected = config.get("GRIST_AUTHORIZATION")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get("authorization")
    if not received:
        return False
    return safe_equal(received, expected)


async def require_grist_auth(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_grist_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing Authorization header")


def handle_rows(rows: list) -> None:
    # Grist payloads have no event field: the event types (add, update) are set in the
    # webhook's config, and the body is a JSON array of row objects (id plus column values).
    # Rows arrive batched and Grist retries until success, so keep this idempotent.
    for row in rows:
        print(f"Grist row {row.get('id')} received")
        # TODO: upsert the row into your system, keyed on row["id"]


@app.post("/webhooks/grist", dependencies=[Depends(require_grist_auth)])
async def grist_webhook(request: Request):
    # Read the raw body so any content type works.
    raw_body = await request.body()

    try:
        rows = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
        raise HTTPException(status_code=400, detail="Expected a JSON array of row objects")

    try:
        handle_rows(rows)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Grist webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True, "rows": len(rows)}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
