# Generated with: rebrandly-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_rebrandly_request(headers, secret=None, header_name=None) -> bool:
    """Rebrandly does not sign webhooks. The sender adds a header you chose
    (REBRANDLY_WEBHOOK_HEADER, default "Authorization") whose whole value must equal
    REBRANDLY_WEBHOOK_SECRET. Compare the whole value: do not strip a "Bearer " prefix.
    """
    secret = secret if secret is not None else os.environ.get("REBRANDLY_WEBHOOK_SECRET")
    if not secret:
        return False  # never accept when unconfigured
    header_name = header_name or os.environ.get("REBRANDLY_WEBHOOK_HEADER") or "Authorization"
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), secret.encode("utf-8"))


async def require_rebrandly_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read."""
    if not verify_rebrandly_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_click(click: dict) -> None:
    country = (click.get("client") or {}).get("location", {}).get("country")
    route_id = (click.get("route") or {}).get("id")
    print(f"Click on {route_id} from {country or 'unknown'} at {click.get('timestamp')}")
    # TODO: store the click (click["client"], click["referral"], click["route"])


# Clickstream sends POST or PUT, depending on what you gave Rebrandly; accept any method.
@app.api_route(
    "/webhooks/rebrandly",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    dependencies=[Depends(require_rebrandly_credential)],
)
async def rebrandly_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()
    if not raw_body.strip():
        return {"received": True, "clicks": 0}  # empty body: nothing to process

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")
    clicks = payload.get("data", [])
    if not isinstance(clicks, list):
        raise HTTPException(status_code=400, detail="Expected data to be an array of clicks")

    # Clickstream body: { data: [ click, ... ], key }. Only click events exist.
    try:
        for click in clicks:
            handle_click(click)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Rebrandly clicks: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True, "clicks": len(clicks)}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
