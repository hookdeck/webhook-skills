# Generated with: roller-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_roller_request(headers, api_key=None) -> bool:
    """ROLLER does not sign payloads. It sends the webhook's authentication.apiKey as
    plain text in the x-roller-apikey header. This authenticates the sender only:
    there is no timestamp, so no replay protection.
    """
    api_key = api_key if api_key is not None else os.environ.get("ROLLER_WEBHOOK_API_KEY")
    if not api_key:
        return False  # never accept when unconfigured
    received = headers.get("x-roller-apikey")
    if not received:
        return False
    # compare_digest on bytes: str arguments raise TypeError on non-ASCII input
    return hmac.compare_digest(received.encode("utf-8"), api_key.encode("utf-8"))


async def require_roller_api_key(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_roller_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing x-roller-apikey")


def handle_event(payload: dict) -> None:
    # ROLLER sends `type` (Booking, Customer, Redemption, ...) and `eventType`
    # (Created, Updated, Cancelled) as separate fields, never a dotted name.
    event = f"{payload.get('type')}.{payload.get('eventType')}"

    if event == "Booking.Created":
        print("Booking created")
        # TODO: handle Booking.Created

    elif event == "Booking.Updated":
        print("Booking updated")
        # TODO: handle Booking.Updated

    elif event == "Booking.Cancelled":
        print("Booking cancelled")
        # TODO: handle Booking.Cancelled

    elif event == "Customer.Created":
        print("Customer created")
        # TODO: handle Customer.Created

    elif event == "Redemption.Created":
        print("Redemption created")
        # TODO: handle Redemption.Created

    elif event == "PaymentLink.Created":
        print("Payment link created")
        # TODO: handle PaymentLink.Created

    else:
        print(f"Unhandled event: {event}")


@app.post("/webhooks/roller", dependencies=[Depends(require_roller_api_key)])
async def roller_webhook(request: Request):
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
        print(f"Error handling ROLLER event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
