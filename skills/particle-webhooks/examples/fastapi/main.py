# Generated with: particle-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os
from urllib.parse import parse_qsl

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_particle_request(headers, secret=None, header_name=None) -> bool:
    """Particle does not sign webhooks. Authenticate with a secret header you add to the
    integration. The header name is yours to choose (PARTICLE_WEBHOOK_HEADER, default
    Authorization) and the WHOLE value is compared, so "Bearer " is not stripped or parsed.
    """
    secret = secret if secret is not None else os.environ.get("PARTICLE_WEBHOOK_SECRET")
    header_name = header_name or os.environ.get("PARTICLE_WEBHOOK_HEADER") or "Authorization"
    if not secret:
        return False  # never accept when unconfigured
    received = headers.get(header_name)  # Starlette headers are case-insensitive
    if not received:
        return False
    # Compare bytes, never str (compare_digest raises on non-ASCII str). Starlette decodes
    # header values as latin-1, so re-encode with latin-1 to recover the bytes the client sent.
    return hmac.compare_digest(received.encode("latin-1"), secret.encode("utf-8"))


async def require_particle_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is read or parsed."""
    if not verify_particle_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing webhook header")


def parse_particle_payload(raw_body: bytes, content_type: str, query_params) -> dict:
    """Default Particle body: application/x-www-form-urlencoded with event, data,
    published_at and coreid. JSON bodies and GET query strings are also supported.
    An empty body is valid (GET, DELETE). Raises ValueError on malformed bodies."""
    payload = dict(query_params)
    text = raw_body.decode("utf-8")
    if not text.strip():
        return payload

    content_type = (content_type or "").lower()
    if "json" in content_type:
        body = json.loads(text)  # JSONDecodeError is a ValueError
    elif "x-www-form-urlencoded" in content_type:
        body = dict(parse_qsl(text, keep_blank_values=True))
    else:
        try:
            body = json.loads(text)  # custom bodies: JSON if it parses, else keep the text
        except json.JSONDecodeError:
            body = {"raw": text}
    if not isinstance(body, dict):
        raise ValueError("Expected an object body")
    return {**payload, **body}


# Event names are chosen by your device firmware (Particle.publish("temperature", ...)).
# These two are illustrative; replace them with your own.
def handle_event(payload: dict) -> str:
    event = payload.get("event")
    data = payload.get("data")
    coreid = payload.get("coreid")
    published_at = payload.get("published_at")

    if event == "temperature":
        print(f"Temperature {data} from {coreid} at {published_at}")
        # TODO: store the reading (float(data))
        return "temperature"

    if event == "motion-detected":
        print(f"Motion detected on {coreid} at {published_at}")
        # TODO: raise an alert
        return "motion-detected"

    print(f"Unhandled event: {event}")
    return "unhandled"


# requestType may be GET, POST, PUT or DELETE (PATCH accepted too); every method is authenticated.
@app.api_route(
    "/webhooks/particle",
    methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    dependencies=[Depends(require_particle_header)],
)
async def particle_webhook(request: Request):
    # Read the raw body so any content type is accepted (and an empty body is fine).
    raw_body = await request.body()

    try:
        payload = parse_particle_payload(
            raw_body, request.headers.get("content-type", ""), request.query_params
        )
    except ValueError:  # includes JSONDecodeError and UnicodeDecodeError
        raise HTTPException(status_code=400, detail="Invalid request body")

    try:
        event = handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Particle event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True, "event": event}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
