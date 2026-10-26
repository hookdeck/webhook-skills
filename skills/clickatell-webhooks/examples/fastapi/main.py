# Generated with: clickatell-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import json
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI()


def verify_clickatell_request(headers, name=None, expected=None) -> bool:
    """Clickatell One API callbacks are unsigned. Authenticate with the Custom Security Header
    you added to the callback URL: the header name is yours (CLICKATELL_WEBHOOK_HEADER, default
    Authorization) and the expected value is the exact, whole header value, including any
    "Bearer " prefix. No prefix parsing.
    """
    name = name or os.environ.get("CLICKATELL_WEBHOOK_HEADER") or "Authorization"
    expected = expected if expected is not None else os.environ.get("CLICKATELL_WEBHOOK_SECRET")
    if not expected:
        return False  # never accept when unconfigured
    received = headers.get(name.lower())  # Starlette headers are case-insensitive
    if not received:
        return False
    # Encode both sides: compare_digest raises TypeError on non-ASCII str.
    return hmac.compare_digest(received.encode("utf-8"), expected.encode("utf-8"))


async def require_clickatell_header(request: Request) -> None:
    """FastAPI dependency: reject the request before the body is parsed."""
    if not verify_clickatell_request(request.headers):
        raise HTTPException(status_code=401, detail="Invalid or missing security header")


# One handler per event kind: the name of the key inside `event`. Each value is a list.
def handle_message_status_update(e: dict) -> None:
    print(f"Message {e.get('messageId')} status: {e.get('status')} ({e.get('statusCode')})")
    # TODO: update delivery state; events can repeat or arrive out of order (use e["timestamp"])


def handle_message_fallback(e: dict) -> None:
    print(f"Message {e.get('messageId')} fallback: {e.get('status')}")
    # TODO: record the channel fallback


def handle_status_is_typing(e: dict) -> None:
    print(f"{e.get('from')} is typing")
    # TODO: show a typing indicator


def handle_mo_text(e: dict) -> None:
    print(f"Text from {e.get('from')}: {e.get('content')}")
    # TODO: route to your bot or inbox


def handle_mo_media(e: dict) -> None:
    files = e.get("files") or [{}]
    print(f"Media from {e.get('from')}: {e.get('contentType') or files[0].get('contentType')}")
    # TODO: download e["files"][]["downloadUrl"] and store it


def handle_mo_location(e: dict) -> None:
    print(f"Location from {e.get('from')}: {e.get('locationName')}")
    # TODO: use e["latitute"] / e["longitude"] (the docs spell it "latitute")


def handle_mo_contacts(e: dict) -> None:
    print(f"Contacts from {e.get('from')}: {len(e.get('contacts') or [])}")
    # TODO: import e["contacts"]


def handle_mo_suggested_response(e: dict) -> None:
    print(f"Suggested response from {e.get('from')}: {e.get('postbackData')}")
    # TODO: continue the flow using e["postbackData"]


def handle_mo_list_picker_response(e: dict) -> None:
    print(f"List selection from {e.get('from')}")
    # TODO: continue the flow using e["selectedItems"]


def handle_mo_button_response(e: dict) -> None:
    print(f"Button response from {e.get('from')}")
    # TODO: continue the flow using e["selectedItem"]


HANDLERS = {
    "messageStatusUpdate": handle_message_status_update,
    "messageFallback": handle_message_fallback,
    "statusIsTyping": handle_status_is_typing,
    "moText": handle_mo_text,
    "moMedia": handle_mo_media,
    "moLocation": handle_mo_location,
    "moContacts": handle_mo_contacts,
    "moSuggestedResponse": handle_mo_suggested_response,
    "moListPickerResponse": handle_mo_list_picker_response,
    "moButtonResponse": handle_mo_button_response,
}


def handle_event(payload: dict) -> None:
    for kind, events in payload["event"].items():
        handler = HANDLERS.get(kind)
        if handler is None:
            print(f"Unhandled event: {kind}")
            continue
        for e in events if isinstance(events, list) else []:
            handler(e)


@app.post("/webhooks/clickatell", dependencies=[Depends(require_clickatell_header)])
async def clickatell_webhook(request: Request):
    # Read the raw body so any content type is accepted.
    raw_body = await request.body()

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if not isinstance(payload, dict) or not isinstance(payload.get("event"), dict):
        raise HTTPException(status_code=400, detail="Expected a JSON object with an event object")

    try:
        handle_event(payload)
    except Exception as err:  # noqa: BLE001
        print(f"Error handling Clickatell event: {err}")
        raise HTTPException(status_code=500, detail="Handler error")

    return {"received": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
