# Generated with: maximizer-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def safe_equal(a: str, b: str) -> bool:
    """Constant-time comparison on bytes (compare_digest on equal-length digests).

    Both sides are encoded: compare_digest raises TypeError on a non-ASCII str.
    """
    return hmac.compare_digest(
        hashlib.sha256(a.encode("utf-8")).digest(),
        hashlib.sha256(b.encode("utf-8")).digest(),
    )


def get_header(headers, name: str):
    """Case-insensitive header lookup (works for Starlette headers and plain dicts)."""
    wanted = name.lower()
    for key, value in headers.items():
        if key.lower() == wanted:
            return value
    return None


def verify_maximizer_request(headers, secret=None, header_name=None) -> bool:
    """Maximizer does not sign payloads. You add a header to the target's Endpoint.Headers
    and Maximizer sends it on every request. The header name is yours to choose, so it
    comes from MAXIMIZER_WEBHOOK_HEADER (default "Authorization"). The WHOLE header value
    is compared with MAXIMIZER_WEBHOOK_SECRET; a "Bearer " prefix is not parsed or stripped.
    This authenticates the sender only: it does not cover the body and has no replay protection.
    """
    secret = secret if secret is not None else os.environ.get("MAXIMIZER_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("MAXIMIZER_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = get_header(headers, header_name)
    return received is not None and safe_equal(received, secret)


async def require_maximizer_credential(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_maximizer_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook credential")


def handle_event(webhook: dict) -> None:
    entity = webhook.get("Entity")
    data = webhook.get("Data") or {}
    # The operation is in Data.Op ("Create", "Update", "Delete"); tolerate other casing.
    raw_op = data.get("Op") or webhook.get("Op")
    op = raw_op.capitalize() if isinstance(raw_op, str) else raw_op
    new = data.get("New") or {}
    original = data.get("Original") or {}

    key = f"{entity}.{op}"

    if key == "AbEntry.Create":
        print(f"Contact created: {new.get('Key')}")
        # TODO: add the contact to your system (data["New"])

    elif key == "AbEntry.Update":
        print(f"Contact updated: {new.get('Key')}")
        # TODO: sync changed fields (data["Original"] vs data["New"])

    elif key == "AbEntry.Delete":
        print(f"Contact deleted: {original.get('Key')}")
        # TODO: remove or archive the contact

    elif key == "Opportunity.Create":
        print(f"Opportunity created: {new.get('Key')}")
        # TODO: open a deal in your system

    elif key == "Opportunity.Update":
        print(f"Opportunity updated: {new.get('Key')}")
        # TODO: handle stage changes (SalesStageSetupName in Original and New)

    elif key == "Opportunity.Delete":
        print(f"Opportunity deleted: {original.get('Key')}")
        # TODO: close the matching deal

    elif key == "Lead.Create":
        print(f"Lead created: {new.get('Key')}")
        # TODO: route the lead to sales

    elif key == "Lead.Update":
        print(f"Lead updated: {new.get('Key')}")
        # TODO: sync changed fields

    elif key == "Lead.Delete":
        print(f"Lead deleted: {original.get('Key')}")
        # TODO: remove the lead

    else:
        print(f"Unhandled event: {key}")


def process_events(events: list) -> None:
    """Runs after the 200 has been sent, so slow work can't breach Maximizer's 2s limit."""
    for webhook in events:
        try:
            handle_event(webhook)
        except Exception as err:  # noqa: BLE001
            print(f"Error handling Maximizer event: {err}")


@app.post("/webhooks/maximizer", dependencies=[Depends(require_maximizer_credential)])
async def maximizer_webhook(request: Request, background_tasks: BackgroundTasks):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        events = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # Maximizer posts a JSON ARRAY of webhook objects.
    if not isinstance(events, list) or not all(isinstance(e, dict) for e in events):
        raise HTTPException(status_code=400, detail="Expected a JSON array of webhook objects")

    background_tasks.add_task(process_events, events)
    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
