# Generated with: greendot-webhooks skill
# https://github.com/hookdeck/webhook-skills
import json
import os

import jwt  # PyJWT
from fastapi import FastAPI, Request, Response

app = FastAPI()

TOKEN_SECRET = os.environ.get("GREENDOT_WEBHOOK_TOKEN_SECRET", "")
REQUIRED_SCOPE = os.environ.get("GREENDOT_WEBHOOK_SCOPE", "post:webhook")


def verify_token(auth_header: str) -> dict:
    """Authenticate the delivery via the OAuth client_credentials Bearer token.

    Green Dot authenticates itself to your endpoint (push auth). The token is
    issued by the client_credentials grant with scope ``post:webhook``.

    In production, validate against your authorization server (JWKS / RS256 or
    token introspection). Here we validate an HS256 token with a shared secret so
    the example is self-contained and testable.
    """
    token = (auth_header or "").removeprefix("Bearer ").strip()
    if not token:
        raise ValueError("Missing bearer token")
    claims = jwt.decode(token, TOKEN_SECRET, algorithms=["HS256"])
    raw_scope = str(claims.get("scope") or claims.get("scp") or "")
    scopes = raw_scope.replace(",", " ").split()
    if REQUIRED_SCOPE not in scopes:
        raise ValueError("Token missing required scope")
    return claims


# NOTE: The ``x-gd-signature`` header is intentionally NOT verified.
#
# A delivery may carry ``x-gd-signature``, but Green Dot's public docs do not
# document its algorithm, encoding, or canonical payload — there is no published
# scheme to reproduce. Wiring in a guessed HMAC would make an unverified payload
# look verified, which is worse than no check. Authenticity comes from the OAuth
# Bearer token (and/or the Certificate/mTLS transport). If your Green Dot
# representative gives you the exact signature spec and key, implement the check
# over the raw body here, after verify_token.


def events_in(body: dict) -> list:
    """The body is an envelope: {accounts: [{accountIdentifier, events: [...]}]}.
    One request can carry several events, so loop over both arrays."""
    return [e for a in body.get("accounts") or [] for e in a.get("events") or []]


def handle_event(event: dict) -> None:
    """Dispatch on one event's ``eventType``."""
    event_type = event.get("eventType")
    event_id = event.get("eventIdentifier")

    if event_type == "transaction":
        print(f"Transaction event: {event_id}")
        # Your code: sync ledger, notify the customer, etc.
    elif event_type == "accountUpdated":
        print(f"Account updated: {event_id}")
        # Your code: refresh local account record.
    elif event_type == "achTransfer":
        print(f"ACH transfer event: {event_id}")
        # Your code: update funding / payout status.
    elif event_type == "cardUpdate":
        print(f"Card update: {event_id}")
        # Your code: card lifecycle handling.
    elif event_type == "billPayTransfer":
        print(f"Bill pay transfer: {event_id}")
        # Your code: bill pay status / receipts.
    elif event_type == "directDepositSwitch":
        print(f"Direct deposit switch: {event_id}")
        # Your code: DD onboarding funnel.
    elif event_type == "provisioning":
        print(f"Provisioning event: {event_id}")
        # Your code: onboarding orchestration.
    else:
        print(f"Unhandled eventType: {event_type}")


def acknowledge(request_id: str | None, code: int = 0) -> Response:
    """Build the acknowledgement Green Dot expects: a ``responseDetails`` body
    plus the echoed ``x-GD-RequestId`` header. Green Dot's docs require both."""
    body = {
        "responseDetails": [
            {"code": code, "subCode": 0, "description": request_id or ""}
        ]
    }
    headers = {"x-GD-RequestId": request_id} if request_id else {}
    return Response(content=json.dumps(body), media_type="application/json", headers=headers)


@app.post("/webhooks/greendot")
async def greendot_webhook(request: Request) -> Response:
    request_id = request.headers.get("x-GD-RequestId")
    raw_body = await request.body()  # raw bytes so parsing follows authentication

    # 1) Authenticate the OAuth Bearer token (the real gate).
    try:
        verify_token(request.headers.get("authorization"))
    except Exception as err:  # jwt errors + ValueError
        return Response(
            content=json.dumps({"error": "Unauthorized", "message": str(err)}),
            media_type="application/json",
            status_code=401,
        )

    # Note: x-gd-signature is not verified — see the note above.

    # 2) Parse only AFTER authentication succeeds.
    try:
        event = json.loads(raw_body)
    except json.JSONDecodeError:
        return Response(
            content=json.dumps({"error": "Invalid JSON"}),
            media_type="application/json",
            status_code=400,
        )

    # 3) Handle the event.
    try:
        for item in events_in(event):
            handle_event(item)
    except Exception as err:  # noqa: BLE001
        print(f"Handler error: {err}")
        return Response(
            content=json.dumps({"error": "Handler error"}),
            media_type="application/json",
            status_code=500,
        )

    # 4) Acknowledge: echo x-GD-RequestId + return responseDetails.
    return acknowledge(request_id)
