# Generated with: factorial-webhooks skill
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


def verify_factorial_request(headers, challenge=None) -> bool:
    """Factorial does not sign payloads. If the subscription was created with a
    `challenge`, every delivery carries it, unchanged, in x-factorial-wh-challenge.
    Compare the WHOLE header value with the challenge you stored.
    (Without a challenge Factorial sends nothing to verify.)
    """
    challenge = challenge if challenge is not None else os.environ.get("FACTORIAL_WH_CHALLENGE")
    if not challenge:
        return False  # never accept when unconfigured
    received = headers.get("x-factorial-wh-challenge")
    return bool(received) and safe_equal(received, challenge)


async def require_factorial_challenge(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_factorial_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing x-factorial-wh-challenge")


# The body is the affected resource with no event field: the subscription decides the type.
# Register one target_url per subscription_type (e.g. ...?type=timeoff/leave/create) and
# dispatch on that hint. The `type` query parameter is this example's convention, not Factorial's.
HANDLERS = {
    "employees/employee/create_with_contract": lambda r: print(f"Employee created: {r.get('id')} {r.get('full_name')}"),
    "employees/employee/update": lambda r: print(f"Employee updated: {r.get('id')} {r.get('full_name')}"),
    "employees/employee/terminate": lambda r: print(f"Employee terminated: {r.get('id')} on {r.get('terminated_on')}"),
    "contracts/contract_version/create": lambda r: print(f"Contract version created: {r.get('id')}"),
    "timeoff/leave/create": lambda r: print(f"Leave requested: {r.get('id')}"),
    "timeoff/leave/approve": lambda r: print(f"Leave approved: {r.get('id')}"),
    "timeoff/leave/reject": lambda r: print(f"Leave rejected: {r.get('id')}"),
    "attendance/shift/clock_in": lambda r: print(f"Clock in: shift {r.get('id')}"),
    "ats/application/create": lambda r: print(f"Application created: {r.get('id')}"),
    "ats/candidate/create": lambda r: print(f"Candidate created: {r.get('id')}"),
}


def handle_resource(subscription_type, resource: dict) -> None:
    handler = HANDLERS.get(subscription_type)
    if handler:
        # Retries re-send an identical body and there is no delivery ID, so make the work
        # idempotent: upsert on resource["id"], or dedupe on type + id + updated_at.
        handler(resource)
    else:
        print(f"Unhandled subscription type: {subscription_type or '(none)'}")


@app.post("/webhooks/factorial", dependencies=[Depends(require_factorial_challenge)])
async def factorial_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        resource = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(resource, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_resource(request.query_params.get("type"), resource)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Factorial webhook: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
