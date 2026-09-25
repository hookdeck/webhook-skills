# Generated with: formstack-webhooks skill
# https://github.com/hookdeck/webhook-skills

import hashlib
import hmac
import json
import os
import re
import urllib.parse
from typing import Any, Callable, Dict, Optional

from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request

load_dotenv()

app = FastAPI(title="Formstack Webhooks Example")

# `x-fs-signature` is the DEFAULT header. The WebHook's "Custom HMAC Header" field
# overrides it -- the Formstack help article: "If left blank, X-FS-Signature will be
# used as the HMAC header." Lowercase: Starlette exposes headers lowercased and HTTP
# header names are case-insensitive.
DEFAULT_SIGNATURE_HEADER = "x-fs-signature"


def signature_header_name() -> str:
    return (os.environ.get("FORMSTACK_SIGNATURE_HEADER") or DEFAULT_SIGNATURE_HEADER).lower()


def verify_formstack_webhook(
    raw_body: bytes,
    signature_header: Optional[str],
    hmac_key: Optional[str],
) -> bool:
    """Verify a Formstack WebHook delivery.

    Formstack computes HMAC-SHA256 over the RAW request body bytes, keyed with the
    per-WebHook "HMAC Key", rendered as LOWERCASE HEX. Nothing else is signed -- no
    timestamp, no nonce, no URL, no method.

    NOT FastSpring. FastSpring (fastspring.com, unrelated company) uses the same
    ``X-FS-Signature`` header name with a BASE64 digest and an ``events[]`` envelope.

    Fails CLOSED: a missing key or missing header is a rejection, never an accept.
    Signing is optional and off by default in Formstack, which makes "no secret, accept
    anyway" tempting -- it would let anyone who knows the URL post fake submissions.
    """
    if not signature_header or not hmac_key:
        return False

    # Formstack sends `sha256=<hex>`. Strip the prefix case-insensitively (a bare digest
    # is tolerated too), trim, and normalise case before comparing.
    received = re.sub(r"^sha256=", "", signature_header.strip(), flags=re.IGNORECASE)
    received = received.strip().lower()

    expected = hmac.new(hmac_key.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Compare as BYTES, not str: hmac.compare_digest refuses str arguments that contain
    # non-ASCII characters (it raises TypeError). Header values reach us latin-1 decoded,
    # so a hostile sender could otherwise turn a bad signature into an unhandled 500
    # instead of a clean rejection.
    return hmac.compare_digest(
        received.encode("utf-8", "replace"), expected.encode("ascii")
    )


def parse_submission(raw_body: bytes, content_type: str) -> Dict[str, Any]:
    """Parse the raw body according to the WebHook's configured content type.

    Never re-encode the result and hash it -- the digest covers the raw bytes.
    """
    if "application/json" in content_type:
        parsed = json.loads(raw_body)
        if not isinstance(parsed, dict):
            raise ValueError("Expected a JSON object")
        return parsed

    if "application/x-www-form-urlencoded" in content_type:
        # keep_blank_values: an unanswered optional field arrives as an empty value and
        # is still part of the submission.
        return dict(
            urllib.parse.parse_qsl(raw_body.decode("utf-8"), keep_blank_values=True)
        )

    raise ValueError(f"Unsupported content type: {content_type}")


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/webhooks/formstack")
async def formstack_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
) -> Dict[str, bool]:
    # Read the RAW bytes first.
    #
    # THIS IS THE WHOLE BALLGAME for Formstack. The default content type is
    # `application/x-www-form-urlencoded` and the digest covers the RAW urlencoded
    # bytes, not a re-encoded form of the parsed dict. Calling `await request.form()`
    # here would lose the exact bytes the HMAC covers.
    raw_body = await request.body()

    header_name = signature_header_name()
    signature = request.headers.get(header_name)

    if not signature:
        print(f"Missing {header_name} header")
        raise HTTPException(status_code=400, detail="Missing signature header")

    hmac_key = os.environ.get("FORMSTACK_HMAC_KEY")

    # FAIL CLOSED on misconfiguration. 500 (not 400) so the operator can tell
    # "my server is misconfigured" apart from "someone sent a bad signature".
    if not hmac_key:
        print("FORMSTACK_HMAC_KEY is not set -- refusing to accept unverified webhooks")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    # 1. Verify BEFORE parsing. The HMAC is the only credential Formstack sends (the
    #    WebHook Shared Secret is a separate, weaker, bearer-style token).
    if not verify_formstack_webhook(raw_body, signature, hmac_key):
        print("Formstack webhook signature verification failed")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # 2. Parse only after the signature checks out. The content type is chosen per
    #    WebHook (`contentType`: `urlencoded` -- the default -- or `json`), and one
    #    endpoint is commonly pointed at several forms, so support both.
    try:
        fields = parse_submission(raw_body, request.headers.get("content-type", ""))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        raise HTTPException(status_code=400, detail="Invalid payload")

    # There is NO event type in a Formstack webhook -- no event header, no event body
    # field, no event names. A WebHook fires on exactly one thing: a form submission.
    # The discriminator is the FORM.
    form_id = str(fields["FormID"]) if fields.get("FormID") is not None else None
    unique_id = str(fields["UniqueID"]) if fields.get("UniqueID") is not None else None

    print(f"✓ Verified Formstack submission (FormID={form_id}, UniqueID={unique_id})")

    # IDEMPOTENCY IS REQUIRED. Nothing but the body is signed -- no timestamp, no nonce
    # -- so a captured delivery replays indefinitely and no staleness check is possible.
    # Deduplicate on UniqueID, falling back to a hash of the raw body.
    idempotency_key = unique_id or hashlib.sha256(raw_body).hexdigest()

    # 3. Acknowledge quickly. Formstack publishes no retry policy or delivery timeout,
    #    so assume nothing and get out of the way.
    background_tasks.add_task(handle_submission, form_id, fields, idempotency_key)

    return {"received": True}


def handle_contact_form(fields: Dict[str, Any], idempotency_key: str) -> None:
    """Example per-form handler. Wire your own into FORM_HANDLERS below."""
    print(f"📬 Contact form submission {idempotency_key}: {fields.get('Email')}")


# Per-form handlers, keyed on FormID -- NOT on an event type, because Formstack has none.
#
# Replace these IDs with your own forms'. Every key is optional: the payload shape is
# whatever the form's fields are called, and a form editor can change it at any time.
FORM_HANDLERS: Dict[str, Callable[[Dict[str, Any], str], None]] = {
    # "1234567": handle_contact_form,
}


def handle_submission(
    form_id: Optional[str],
    fields: Dict[str, Any],
    idempotency_key: str,
) -> None:
    # TODO: check idempotency_key against your store and return early if already processed.

    handler = FORM_HANDLERS.get(form_id) if form_id else None

    if handler is not None:
        handler(fields, idempotency_key)
        return

    # Default branch. A form you don't recognise is normal -- someone may have pointed a
    # new form at this endpoint. Log it, don't fail, and never return non-2xx for it.
    field_keys = [k for k in fields if k not in ("FormID", "UniqueID")]
    print(f"📝 Submission from form {form_id} with {len(field_keys)} field(s):")
    for key in field_keys:
        print(f"   {key} = {format_value(fields[key])}")

    # To find out exactly which fields a given form will send, ask Formstack:
    #   GET https://www.formstack.com/api/v2025/forms/{formId}/webhooks/openapi
    # It returns a generated OpenAPI schema for THAT form's webhook payload.


def format_value(value: Any) -> str:
    """Values are usually strings, but a JSON WebHook can send nested structures."""
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return str(value)


if __name__ == "__main__":
    import uvicorn

    if not os.environ.get("FORMSTACK_HMAC_KEY"):
        print("⚠️  Warning: FORMSTACK_HMAC_KEY not set -- every delivery will be rejected")
        print("   Set an HMAC Key on the WebHook in Formstack first, or nothing is signed")

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
