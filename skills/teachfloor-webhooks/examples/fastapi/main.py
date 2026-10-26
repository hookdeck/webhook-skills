# Generated with: teachfloor-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hashlib
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_teachfloor_signature(raw_body: bytes, signature, secret=None) -> bool:
    """Teachfloor sends teachfloor-signature: bare hex HMAC-SHA256 of the raw request body,
    keyed with the endpoint's signing secret used as a UTF-8 string (no prefix, no timestamp).
    Both sides are compared as bytes: compare_digest raises TypeError on a non-ASCII str,
    which would turn a bad header into a 500 instead of a 401. Hex is case-insensitive, so the
    header is lowercased first."""
    if secret is None:
        secret = os.environ.get("TEACHFLOOR_WEBHOOK_SECRET")
    if not secret or not isinstance(signature, str):
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected.encode("utf-8"), signature.lower().encode("utf-8"))


def as_dict(value) -> dict:
    """The body is signed, not trusted: return {} for anything that isn't a dict."""
    return value if isinstance(value, dict) else {}


def handle_event(body: dict) -> None:
    event_type = body.get("type")
    data = as_dict(body.get("data"))

    if event_type == "course.join":
        print("Member joined course", {"member": as_dict(data.get("member")).get("id"),
                                       "course": as_dict(data.get("course")).get("id")})
        # TODO: provision access or add the member to your CRM

    elif event_type == "course.completed":
        print("Course completed", {"member": as_dict(data.get("member")).get("id"), "data": data.get("id")})
        # TODO: issue a credential or notify the learner

    elif event_type in ("course.created", "course.updated"):
        print(f"Course event ({event_type})", data.get("id"))

    elif event_type in ("module.created", "module.updated"):
        print(f"Module event ({event_type})", data.get("id"))

    elif event_type in ("element.created", "element.updated", "element.deleted"):
        print(f"Element event ({event_type})", data.get("id"))

    elif event_type == "element.completed":
        print("Element completed", {"member": as_dict(data.get("member")).get("id"),
                                    "element": as_dict(data.get("context")).get("id"),
                                    "passed": data.get("passed")})
        # TODO: update progress tracking

    elif event_type == "member.login":
        print("Member logged in", as_dict(data.get("member")).get("id", data.get("id")))

    else:
        print(f"Unhandled event: {event_type}")


@app.post("/webhooks/teachfloor")
async def teachfloor_webhook(request: Request):
    # Raw bytes, whatever the content type: the signature covers exactly these.
    raw_body = await request.body()

    if not verify_teachfloor_signature(raw_body, request.headers.get("teachfloor-signature")):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        body = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object")

    try:
        handle_event(body)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Teachfloor event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
