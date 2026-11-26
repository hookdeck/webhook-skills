# Generated with: azure-event-grid-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Azure Event Grid webhook handler for FastAPI.

IMPORTANT: Event Grid does NOT sign the request body. There is no signature
header, no HMAC, no shared signing secret. Nothing in this file computes an HMAC
over the payload, and nothing should. Trust comes from:

  1. an ownership handshake at subscription time — two flavours:
     - Event Grid schema: a POSTed Microsoft.EventGrid.SubscriptionValidationEvent
       whose data.validationCode you echo back as `validationResponse`
     - CloudEvents v1.0 schema: an HTTP OPTIONS abuse-protection preflight
       answered with `WebHook-Allowed-Origin`
  2. authentication on the delivery channel — a static delivery-property header
     you configured, or a Microsoft Entra ID bearer token.

Because nothing is signed, there is no raw-body requirement: parsing JSON before
authenticating is safe here in a way it never is for an HMAC provider.
"""
import hmac
import json
import os

import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

load_dotenv()

app = FastAPI()

WEBHOOK_PATH = "/webhooks/azure-event-grid"

# Emitted by the Microsoft.EventGrid resource provider itself.
VALIDATION_EVENT_TYPE = "Microsoft.EventGrid.SubscriptionValidationEvent"
SUBSCRIPTION_DELETED_EVENT_TYPE = "Microsoft.EventGrid.SubscriptionDeletedEvent"

# Default name for the static delivery property carrying the shared secret.
# NEVER use the `aeg-` prefix: it is reserved for Event Grid system properties.
DEFAULT_SECRET_HEADER = "x-eventgrid-token"

# Default query-parameter name carrying the shared secret. Event Grid "includes
# all the query parameters in every event delivery request to the webhook", so a
# secret placed in the subscription's endpoint URL arrives on every delivery.
DEFAULT_SECRET_QUERY_PARAM = "token"

# Event Grid treats ONLY 200, 201, 202, 203 and 204 as successful deliveries.
# The validation handshake is stricter still: it must be 200 — "HTTP 202
# Accepted isn't recognized as a valid Event Grid subscription validation
# response" — so this handler answers 200 everywhere.
ACK_STATUS = 200

# Replaceable signing-key resolver for Microsoft Entra ID tokens. Production
# resolves against Entra's JWKS endpoint; tests swap in a local public key.
SIGNING_KEY_RESOLVER = None
_jwks_clients: dict[str, "jwt.PyJWKClient"] = {}


def _default_signing_key_resolver(token: str, tenant_id: str):
    """Fetch the signing key for `token` from the tenant's Entra JWKS endpoint."""
    if tenant_id not in _jwks_clients:
        _jwks_clients[tenant_id] = jwt.PyJWKClient(
            f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys",
            cache_keys=True,
        )
    return _jwks_clients[tenant_id].get_signing_key_from_jwt(token).key


def _parse_list(value, lowercase: bool = True):
    items = [item.strip() for item in (value or "").split(",") if item.strip()]
    return [item.lower() for item in items] if lowercase else items


def check_against_any(received, expected_csv) -> bool:
    """Constant-time match of `received` against ANY of the accepted secrets.

    Accepting a list is what makes secret rotation safe. The Event Grid docs:
    "If you update the client secret, you also need to update the event
    subscription. To avoid delivery failures during this secret rotation, make
    the webhook accept both old and new secrets for a limited duration before
    updating the event subscription with the new secret."

    Fails CLOSED on an empty accepted list — never treat "unset" as "allow all".
    """
    accepted = _parse_list(expected_csv, lowercase=False)
    if not accepted:
        return False
    # Compare against every candidate (no early return) so timing does not leak
    # which secret in the rotation set matched.
    matched = False
    for candidate in accepted:
        if check_delivery_secret(received, candidate):
            matched = True
    return matched


def check_delivery_secret(received, expected) -> bool:
    """Constant-time comparison of the shared secret delivered as a static
    delivery property.

    `hmac.compare_digest` is used purely as a constant-time string comparison —
    no HMAC is computed, because Event Grid signs nothing. Fails CLOSED when
    `expected` is unset: an empty expected secret must never mean "accept
    anything".
    """
    if not expected:
        return False
    return hmac.compare_digest((received or "").encode(), str(expected).encode())


def verify_entra_token(authorization_header, tenant_id, audience):
    """Validate the Microsoft Entra ID bearer token Event Grid attaches when the
    event subscription is configured with --azure-active-directory-tenant-id and
    --azure-active-directory-application-id-or-uri.

    The Event Grid docs say the token is passed and must be validated, but do
    not publish the token's claim set — so this is the standard Entra JWT
    pattern (signature + audience + issuer + expiry) and nothing is hard-coded
    beyond it.

    Returns the token claims, or None if validation failed.
    """
    # RFC 9110 makes the auth scheme case-insensitive.
    scheme, _, token = (authorization_header or "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        return None
    token = token.strip()

    resolver = SIGNING_KEY_RESOLVER or _default_signing_key_resolver
    try:
        key = resolver(token, tenant_id)
    except Exception as exc:  # noqa: BLE001 - network / unknown kid / malformed
        print("Entra signing key lookup failed:", exc)
        return None

    # Entra issues both v2.0 and v1.0 issuer forms; accept the pair for this tenant.
    issuers = (
        f"https://login.microsoftonline.com/{tenant_id}/v2.0",
        f"https://sts.windows.net/{tenant_id}/",
    )
    for issuer in issuers:
        try:
            return jwt.decode(
                token,
                key,
                # Pin the algorithm: never let the token choose (and never `none`).
                algorithms=["RS256"],
                audience=audience,
                issuer=issuer,
            )
        except jwt.InvalidIssuerError:
            continue  # try the other accepted issuer form
        except Exception as exc:  # noqa: BLE001 - bad signature, aud, expiry
            print("Entra token validation failed:", exc)
            return None
    print("Entra token validation failed: unexpected issuer")
    return None


def authenticate(headers, is_validation: bool = False, query_params=None) -> dict:
    """Authenticate an Event Grid request.

    Returns {"ok": True, "subscription_name": ..., "claims": ...} or
    {"ok": False, "status": ..., "error": ...}.
    """
    expected_subscriptions = _parse_list(os.environ.get("AZURE_EVENT_GRID_SUBSCRIPTION_NAMES"))
    allow_unauthenticated = (
        os.environ.get("AZURE_EVENT_GRID_ALLOW_UNAUTHENTICATED") == "true"
    )
    subscription_name = (headers.get("aeg-subscription-name") or "").strip().lower()

    # --- Identity guard on the subscription name -----------------------------
    # The docs: check `aeg-subscription-name` "to ascertain that it's an event
    # subscription that you recognize". Otherwise anyone who learns this URL can
    # point their own subscription at it and flood you with events.
    if expected_subscriptions:
        if not subscription_name or subscription_name not in expected_subscriptions:
            return {"ok": False, "status": 403, "error": "Unrecognized event subscription"}
    elif is_validation and not allow_unauthenticated:
        # Completing the handshake for an unknown subscription is the exact
        # attack the handshake exists to prevent, so refuse rather than echo.
        print(
            "Set AZURE_EVENT_GRID_SUBSCRIPTION_NAMES to the event subscription "
            "name(s) you created."
        )
        return {
            "ok": False,
            "status": 403,
            "error": "No expected event subscriptions configured; refusing to validate",
        }

    # --- Channel authentication ----------------------------------------------
    delivery_secret = os.environ.get("AZURE_EVENT_GRID_DELIVERY_SECRET")
    secret_header = (
        os.environ.get("AZURE_EVENT_GRID_DELIVERY_SECRET_HEADER") or DEFAULT_SECRET_HEADER
    ).lower()
    query_secret = os.environ.get("AZURE_EVENT_GRID_QUERY_SECRET")
    secret_query_param = (
        os.environ.get("AZURE_EVENT_GRID_QUERY_SECRET_PARAM") or DEFAULT_SECRET_QUERY_PARAM
    )
    tenant_id = os.environ.get("AZURE_EVENT_GRID_ENTRA_TENANT_ID")
    audience = os.environ.get("AZURE_EVENT_GRID_ENTRA_AUDIENCE")

    # Client secret as a QUERY PARAMETER. Documented at
    # learn.microsoft.com/en-us/azure/event-grid/security-authentication as a
    # first-class auth method for webhook handlers: you append the secret to the
    # subscription's endpoint URL and Event Grid replays every query parameter on
    # every delivery. Azure stores these encrypted, keeps them out of service
    # logs, and withholds them when reading the subscription unless you pass
    # `--include-full-endpoint-url`.
    if query_secret:
        received = (query_params or {}).get(secret_query_param)
        if not check_against_any(received, query_secret):
            return {"ok": False, "status": 401, "error": "Invalid delivery credential"}
        return {"ok": True, "subscription_name": subscription_name, "claims": None}

    if delivery_secret:
        if not check_against_any(headers.get(secret_header), delivery_secret):
            return {"ok": False, "status": 401, "error": "Invalid delivery credential"}
        return {"ok": True, "subscription_name": subscription_name, "claims": None}

    if tenant_id and audience:
        claims = verify_entra_token(headers.get("authorization"), tenant_id, audience)
        if not claims:
            return {"ok": False, "status": 401, "error": "Invalid Entra ID token"}
        return {"ok": True, "subscription_name": subscription_name, "claims": claims}

    if allow_unauthenticated:
        return {"ok": True, "subscription_name": subscription_name, "claims": None}

    # Misconfiguration, not a bad request: refuse rather than accept anything.
    print(
        "Set AZURE_EVENT_GRID_QUERY_SECRET, AZURE_EVENT_GRID_DELIVERY_SECRET, or "
        "AZURE_EVENT_GRID_ENTRA_TENANT_ID + AZURE_EVENT_GRID_ENTRA_AUDIENCE, or "
        "AZURE_EVENT_GRID_ALLOW_UNAUTHENTICATED=true."
    )
    return {
        "ok": False,
        "status": 500,
        "error": "Endpoint is not configured to authenticate Event Grid deliveries",
    }


def normalize_events(body):
    """Normalise both delivery schemas into one shape.

    Event Grid schema arrives as a JSON ARRAY ("Event Grid sends the events to
    subscribers in an array that has a single event" — but batching can put up
    to 5,000 in it, so always loop). CloudEvents v1.0 structured mode arrives as
    a single JSON OBJECT.

    Returns a list of normalised events, or None if the body isn't usable.
    """
    if isinstance(body, list):
        items = body
    elif isinstance(body, dict):
        items = [body]
    else:
        return None
    if not items or any(not isinstance(item, dict) for item in items):
        return None

    normalized = []
    for event in items:
        if event.get("specversion"):
            normalized.append(
                {
                    "schema": "cloudevents",
                    "id": event.get("id"),
                    "type": event.get("type"),
                    "subject": event.get("subject"),
                    "time": event.get("time"),
                    "source": event.get("source"),
                    "data": event.get("data"),
                    "raw": event,
                }
            )
        else:
            normalized.append(
                {
                    "schema": "eventgrid",
                    "id": event.get("id"),
                    "type": event.get("eventType"),
                    "subject": event.get("subject"),
                    "time": event.get("eventTime"),
                    "source": event.get("topic"),
                    "data": event.get("data"),
                    "raw": event,
                }
            )
    return normalized


def find_validation_code(events):
    """Find the subscription validation code, if this request is the Event Grid
    schema handshake. CloudEvents subscriptions never send this event — they get
    the HTTP OPTIONS abuse-protection preflight instead.
    """
    for event in events:
        if event["type"] == VALIDATION_EVENT_TYPE:
            data = event.get("data") or {}
            code = data.get("validationCode")
            if isinstance(code, str) and code:
                return code
    return None


def handle_abuse_protection(request_origin):
    """CloudEvents v1.0 abuse-protection preflight (HTTP OPTIONS).

    Consent is signalled by the RESPONSE HEADERS, not the status code — the spec
    is explicit that the handshake "can't rely on status codes". To refuse,
    withhold `WebHook-Allowed-Origin`.

    Note this handshake "doesn't aim to establish an authentication or
    authorization context" — it only proves the endpoint expects traffic.
    """
    allowed_origins = _parse_list(os.environ.get("AZURE_EVENT_GRID_ALLOWED_ORIGINS") or "*")
    rate = os.environ.get("AZURE_EVENT_GRID_ALLOWED_RATE") or "120"

    if not request_origin:
        return 400, {"Allow": "POST, OPTIONS"}

    origin = str(request_origin).strip()
    if "*" not in allowed_origins and origin.lower() not in allowed_origins:
        # Withhold the grant headers. That is the refusal.
        return 403, {"Allow": "POST, OPTIONS"}

    return 200, {
        # MUST be the requested origin or a single '*'.
        "WebHook-Allowed-Origin": "*" if "*" in allowed_origins else origin,
        "WebHook-Allowed-Rate": rate,
        "Allow": "POST, OPTIONS",
    }


@app.options(WEBHOOK_PATH)
async def azure_event_grid_preflight(request: Request):
    """CloudEvents v1.0 abuse-protection preflight.

    This fires INSTEAD OF the SubscriptionValidationEvent when the event
    subscription uses `--event-delivery-schema cloudeventschemav1_0`.
    """
    request_origin = request.headers.get("webhook-request-origin")
    status, headers = handle_abuse_protection(request_origin)
    print(
        "CloudEvents abuse-protection preflight from",
        request_origin or "(no WebHook-Request-Origin)",
        "->",
        status,
    )
    return Response(status_code=status, headers=headers)


@app.post(WEBHOOK_PATH)
async def azure_event_grid_webhook(request: Request):
    # Event Grid does not sign the body, so there is no raw-body requirement.
    try:
        body = json.loads(await request.body())
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JSONResponse({"error": "Invalid JSON body"}, status_code=400)

    # Event Grid schema => JSON array. CloudEvents schema => single JSON object.
    events = normalize_events(body)
    if events is None:
        return JSONResponse({"error": "Invalid Event Grid payload"}, status_code=400)

    # The handshake arrives as an array containing ONLY the validation event.
    validation_code = find_validation_code(events)

    # Authenticate before answering anything, including the handshake. For the
    # handshake specifically, withholding the 200 is how validation is failed on
    # purpose for a subscription we do not recognise.
    auth = authenticate(
        request.headers,
        is_validation=validation_code is not None,
        # Event Grid replays every query parameter from the subscription's
        # endpoint URL on each delivery, so a secret can ride there.
        query_params=request.query_params,
    )
    if not auth["ok"]:
        print("Rejected Event Grid request:", auth["status"], auth["error"])
        return JSONResponse({"error": auth["error"]}, status_code=auth["status"])

    if validation_code:
        print("Subscription validation handshake for:", auth["subscription_name"])
        # Single JSON OBJECT (not an array), HTTP 200, within 30 seconds.
        # The documented field name is camelCase `validationResponse`;
        # Microsoft's own C#/JS samples emit PascalCase `ValidationResponse`.
        return JSONResponse({"validationResponse": validation_code}, status_code=200)

    # Retry signal: `aeg-delivery-count` is the number of attempts for this event.
    try:
        delivery_count = int(request.headers.get("aeg-delivery-count") or 1)
    except ValueError:
        delivery_count = 1
    if delivery_count > 1:
        print("Retry delivery, attempt", delivery_count)
    print("aeg-event-type:", request.headers.get("aeg-event-type"))

    for event in events:
        # Delivery is at-least-once and unordered: de-duplicate on the event id.
        # Your code: if await already_processed(event["id"]): continue
        print(
            f"[{event['schema']}] {event['type']} {event['id']} subject={event['subject']}"
        )
        data = event.get("data") or {}

        if event["type"] == SUBSCRIPTION_DELETED_EVENT_TYPE:
            # data.eventSubscriptionId is the Azure resource ID of the deleted
            # event subscription. Also flagged by
            # `aeg-event-type: SubscriptionDeletion`.
            print("Event subscription deleted:", data.get("eventSubscriptionId"))
        elif event["type"] == "Microsoft.Storage.BlobCreated":
            # Published by Azure Blob Storage, not by Event Grid itself.
            print("Blob created:", data.get("url"))
        elif event["type"] == "Microsoft.Storage.BlobDeleted":
            print("Blob deleted:", data.get("url"))
        elif event["type"] == "Microsoft.Resources.ResourceWriteSuccess":
            print("Resource write succeeded:", event["subject"])
        else:
            # Event Grid is a broker: most event types belong to the publishing
            # service or to your own custom topic. Route on your own types here.
            print("Unhandled event type:", event["type"])

    # Acknowledge fast. Event Grid waits 30 seconds for a response; exceeding it
    # queues the message for retry. Do slow work asynchronously.
    return JSONResponse({"received": len(events)}, status_code=ACK_STATUS)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
