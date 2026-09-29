# Generated with: sendgrid-inbound-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Twilio SendGrid Inbound Parse webhook receiver.

Receives INBOUND EMAIL. One HTTP POST per message, encoded as
multipart/form-data. This is NOT the SendGrid Event Webhook (delivered /
bounce / open / click, JSON array body) -- the two features share the ECDSA
primitive and these two header names, and nothing else.

There are NO vendor event types here. The only "event" is an email arriving,
and there is no `type` or `event` discriminator on the payload. Route on the
recipient (envelope.to) instead.

  SIGNING: ECDSA, NOT HMAC.
    curve   : NIST P-256 (prime256v1), SHA-256
    headers : X-Twilio-Email-Event-Webhook-Signature (base64)
              X-Twilio-Email-Event-Webhook-Timestamp (Unix seconds string)
    signs   : timestamp + RAW BODY BYTES, concatenated, no separator
    sig enc : base64 of an ASN.1/DER (r,s) SEQUENCE
    key     : base64 DER SubjectPublicKeyInfo -- NOT PEM

  The header names say "Event-Webhook" on Inbound Parse too. Verbatim from the
  docs, not a copy-paste error.

  SIGNING IS OPT-IN. A Parse webhook with no security policy attached sends NO
  signature header at all. This app accepts unsigned requests ONLY when no
  public key is configured, and says so loudly. Once
  SENDGRID_INBOUND_PUBLIC_KEY is set it never falls back.
"""

import base64
import binascii
import hashlib
import json
import logging
import os
import re
import time
from typing import Any, Mapping, Optional

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from dotenv import load_dotenv
from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("sendgrid-inbound")

app = FastAPI(title="SendGrid Inbound Parse Webhook Receiver")

SIGNATURE_HEADER = "x-twilio-email-event-webhook-signature"
TIMESTAMP_HEADER = "x-twilio-email-event-webhook-timestamp"

#: Optional replay window in seconds. 0/unset disables the check.
MAX_AGE_SECONDS = int(os.getenv("SENDGRID_INBOUND_MAX_AGE_SECONDS") or 0)

#: Set true when the security policy includes an ``oauth`` block.
REQUIRE_OAUTH = (os.getenv("SENDGRID_INBOUND_REQUIRE_OAUTH") or "").lower() == "true"

# ---------------------------------------------------------------------------
# RFC 6750 section 3.1 rejection codes.
#
# THE BODY STRING IS LOAD-BEARING. SendGrid caches its access token; a 4xx whose
# body contains one of these literals is the ONLY signal that makes it fetch a
# fresh one. A bare 401 with an empty or custom body leaves the stale token
# cached and every subsequent delivery fails identically.
# ---------------------------------------------------------------------------
OAUTH_ERRORS: dict[str, int] = {
    "invalid_request": 400,  # missing / duplicated / malformed token or parameter
    "invalid_token": 401,  # expired, revoked, malformed, otherwise invalid
    "insufficient_scope": 403,  # valid token, not enough privileges
}


def load_public_key(value: Optional[str]) -> Optional[ec.EllipticCurvePublicKey]:
    """Load the verification key once at import time.

    SendGrid's docs: "You don't need to request the public key for each incoming
    webhook. Doing so may introduce unnecessary latency and dependencies."

    Accepts either the raw base64 DER SPKI the API returns, or PEM if you prefer
    to store it armoured. Returns None when unconfigured or unusable.
    """
    text = (value or "").strip()
    if not text:
        return None
    try:
        if "BEGIN PUBLIC KEY" in text:
            key = serialization.load_pem_public_key(text.encode("utf-8"))
        else:
            # The common case: base64 DER SubjectPublicKeyInfo, no armour.
            # load_pem_public_key raises on this value -- use the DER loader.
            der = base64.b64decode("".join(text.split()), validate=True)
            key = serialization.load_der_public_key(der)
    except (ValueError, TypeError, binascii.Error) as exc:
        logger.error("SENDGRID_INBOUND_PUBLIC_KEY is not a usable public key: %s", exc)
        return None

    if not isinstance(key, ec.EllipticCurvePublicKey):
        logger.error("SENDGRID_INBOUND_PUBLIC_KEY is not an EC public key")
        return None
    return key


PUBLIC_KEY = load_public_key(os.getenv("SENDGRID_INBOUND_PUBLIC_KEY"))


def verify_inbound_parse_signature(
    raw_body: bytes,
    signature: Optional[str],
    timestamp: Optional[str],
    public_key: Optional[ec.EllipticCurvePublicKey],
    max_age_seconds: int = MAX_AGE_SECONDS,
) -> bool:
    """Verify an Inbound Parse signature.

    :param raw_body: The EXACT bytes received. Not a re-serialised form -- see
        the WARNING in SendGrid's docs.
    """
    # Fail closed. A missing header or an unloadable key is a rejection.
    if not public_key or not signature or not timestamp or not raw_body:
        return False

    # Optional replay protection. The timestamp is a real Unix timestamp rather
    # than a nonce, so this is meaningful -- but it is off by default so clock
    # skew never silently drops mail.
    if max_age_seconds > 0:
        try:
            ts = int(timestamp)
        except (TypeError, ValueError):
            return False
        if abs(int(time.time()) - ts) > max_age_seconds:
            return False

    try:
        # Timestamp FIRST, then the raw body. Concatenated as bytes, no
        # separator. The signature is base64 of an ASN.1/DER (r, s) SEQUENCE,
        # which is exactly what ec.ECDSA expects -- do NOT split into r/s or
        # convert to P1363/raw form.
        public_key.verify(
            base64.b64decode(signature, validate=True),
            timestamp.encode("utf-8") + raw_body,
            ec.ECDSA(hashes.SHA256()),
        )
        return True
    except (InvalidSignature, ValueError, TypeError, binascii.Error):
        # Malformed base64, truncated DER, wrong key -- all are rejections,
        # never 500s. An uncaught exception would make SendGrid retry forever.
        return False


def validate_access_token(token: str) -> tuple[bool, bool]:
    """Validate an OAuth access token.

    When the security policy includes an ``oauth`` block, SendGrid performs a
    client-credentials grant against the token_url YOU designated and sends the
    result as ``Authorization: Bearer <token>``. SendGrid does not interpret the
    token -- validating it is entirely your side of the contract.

    REPLACE THIS. A real implementation verifies a JWT against your issuer's
    JWKS (iss / aud / exp / scope), or calls RFC 7662 introspection. The env-var
    allowlist exists only so the OAuth path is runnable and testable.

    :returns: ``(valid, insufficient_scope)``
    """
    accepted = [
        t.strip()
        for t in (os.getenv("SENDGRID_INBOUND_OAUTH_ACCEPTED_TOKENS") or "").split(",")
        if t.strip()
    ]
    return token in accepted, False


def oauth_error(code: str) -> JSONResponse:
    """Build an RFC 6750 rejection. The literal ``code`` must appear in the body."""
    return JSONResponse({"error": code}, status_code=OAUTH_ERRORS[code])


def authorize_oauth(request: Request) -> Optional[str]:
    """Return an OAUTH_ERRORS key when the request should be rejected."""
    header = request.headers.get("authorization")
    if not header:
        return "invalid_request"

    match = re.match(r"^Bearer\s+(\S+)$", header, re.IGNORECASE)
    if not match:
        return "invalid_request"

    valid, insufficient_scope = validate_access_token(match.group(1))
    if insufficient_scope:
        return "insufficient_scope"
    if not valid:
        return "invalid_token"
    return None


def _parse_json_field(value: Optional[str], fallback: Any) -> Any:
    """json.loads that never raises -- malformed mail is routine on an inbound address."""
    if not value:
        return fallback
    try:
        return json.loads(value)
    except (ValueError, TypeError):
        return fallback


def normalize_inbound_email(
    fields: Mapping[str, str],
    files: list[dict[str, Any]],
) -> dict[str, Any]:
    """Normalise both payload formats into one shape.

    DEFAULT (send_raw: false): headers, dkim, content-ids, to, text, html, from,
      sender_ip, spam_report, envelope, attachments, subject, spam_score,
      attachment-info, charsets, SPF
    RAW (send_raw: true): dkim, email, to, from, sender_ip, spam_report,
      envelope, subject, spam_score, charsets, SPF

    Both can arrive at the same endpoint -- the flag lives in the Parse Setting
    and can be flipped without touching this code. Detect it from the payload.
    """
    # The presence of `email` is the reliable raw-mode tell.
    is_raw = "email" in fields

    # NOTE THE MIXED CONVENTIONS. `SPF` is upper-case; `content-ids` and
    # `attachment-info` are hyphenated -- in Python these are ordinary dict keys,
    # but they are not valid attribute names, so never assume dot access works.
    envelope = _parse_json_field(fields.get("envelope"), {})
    envelope_to = envelope.get("to") if isinstance(envelope, dict) else None

    attachments_raw = fields.get("attachments")
    try:
        attachment_count = int(attachments_raw) if attachments_raw is not None else len(files)
    except (TypeError, ValueError):
        attachment_count = len(files)

    return {
        "is_raw": is_raw,
        # envelope.to is a SINGLE-ELEMENT ARRAY of the SMTP RCPT TO address.
        # Route on this -- the `to` header field can differ (BCC, aliases,
        # forwarding) and is for display.
        "envelope_to": envelope_to if isinstance(envelope_to, list) else [],
        "envelope_from": envelope.get("from") if isinstance(envelope, dict) else None,
        "to": fields.get("to"),
        "from": fields.get("from"),
        "subject": fields.get("subject"),
        "sender_ip": fields.get("sender_ip"),
        # A BARE STRING like "{@sendgrid.com : pass}". Looks like JSON, is NOT
        # valid JSON. Never json.loads it.
        "dkim": fields.get("dkim"),
        # Upper-case on the wire.
        "spf": fields.get("SPF"),
        # Only present when the Parse Setting has spam_check: true.
        "spam_score": fields.get("spam_score"),
        "spam_report": fields.get("spam_report"),
        "charsets": _parse_json_field(fields.get("charsets"), {}),
        # Default-format only.
        "headers": fields.get("headers"),
        "text": fields.get("text"),
        "html": fields.get("html"),
        # Raw-format only: the entire MIME message (headers + body + base64
        # attachments). Decompose it with `email.parser` if you need the parts.
        "raw_mime": fields.get("email"),
        # `attachments` is a COUNT (a string like "2"), not a list. The files
        # themselves are separate parts named attachment1, attachment2... The
        # documented example is 1-based; the prose says X ranges from 0. Don't
        # hardcode a start index -- iterate the keys.
        "attachment_count": attachment_count,
        "attachment_info": _parse_json_field(fields.get("attachment-info"), {}),
        # CID -> part name. Use it to rewrite `cid:` references in `html`.
        "content_ids": _parse_json_field(fields.get("content-ids"), {}),
        "files": files,
    }


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/webhooks/sendgrid-inbound")
async def sendgrid_inbound(request: Request, background_tasks: BackgroundTasks):
    """SendGrid Inbound Parse endpoint.

    THE RAW BODY IS READ FIRST, BEFORE ANYTHING PARSES IT.

    SendGrid's docs warn, under an explicit WARNING: "Some web frameworks
    automatically parse multipart data and separate file uploads from the rest
    of the request body. This can break signature validation. [...] Do not parse
    or modify the request body before validating the signature. Use the raw
    request body exactly as it was received."

    Calling ``await request.form()`` first CONSUMES THE STREAM -- a later
    ``await request.body()`` returns nothing useful and verification can never
    succeed. Order is load-bearing. Starlette caches the bytes read by
    ``request.body()``, so ``request.form()`` afterwards replays them safely.
    """
    raw_body = await request.body()  # FIRST. Always.

    # --- OAuth path (independent of signature verification) -----------------
    if REQUIRE_OAUTH:
        error = authorize_oauth(request)
        if error:
            logger.error("SendGrid Inbound Parse OAuth rejection: %s", error)
            return oauth_error(error)

    # --- Signature path ------------------------------------------------------
    signature = request.headers.get(SIGNATURE_HEADER)
    timestamp = request.headers.get(TIMESTAMP_HEADER)

    if PUBLIC_KEY is not None:
        # A key is configured, so signing is expected. Do not fall back.
        if not signature or not timestamp:
            logger.error(
                "Missing Inbound Parse signature headers while a public key is configured"
            )
            return JSONResponse({"error": "Missing signature headers"}, status_code=400)
        if not verify_inbound_parse_signature(raw_body, signature, timestamp, PUBLIC_KEY):
            logger.error("SendGrid Inbound Parse signature verification failed")
            return JSONResponse({"error": "Invalid signature"}, status_code=400)
    elif signature:
        # Signed requests are arriving but we cannot check them -- a
        # misconfiguration on our side, not a bad request from SendGrid. 500
        # makes that visible in logs and gets the delivery retried.
        logger.error(
            "Received a signed Inbound Parse request but SENDGRID_INBOUND_PUBLIC_KEY is not set"
        )
        return JSONResponse({"error": "Webhook public key not configured"}, status_code=500)
    elif not REQUIRE_OAUTH:
        # Genuinely unsigned: no security policy attached to the Parse Setting.
        # A valid SendGrid configuration, but anyone who learns your URL can
        # POST to it.
        logger.warning(
            "Accepting an UNVERIFIED Inbound Parse request - no security policy is "
            "configured. Attach a signature or OAuth policy: see references/setup.md"
        )

    # --- Only now is it safe to parse ---------------------------------------
    try:
        form = await request.form()
    except Exception as exc:  # noqa: BLE001 - any parse failure is a 400, not a 500
        logger.error("Verified request had an unparseable multipart body: %s", exc)
        return JSONResponse({"error": "Invalid multipart body"}, status_code=400)

    fields: dict[str, str] = {}
    files: list[dict[str, Any]] = []
    for name, value in form.multi_items():
        # UploadFile duck-types as "has a .filename and .read()".
        if hasattr(value, "filename") and value.filename is not None:
            content = await value.read()
            files.append(
                {
                    "field": name,
                    "filename": value.filename,
                    "type": value.content_type or "",
                    "size": len(content),
                    "content": content,
                }
            )
        else:
            fields[name] = value if isinstance(value, str) else str(value)

    email = normalize_inbound_email(fields, files)

    # IDEMPOTENCY KEY. Inbound Parse carries no delivery id header, so derive
    # one from the message. The RFC 5322 Message-ID is the natural candidate and
    # is stable across redeliveries; fall back to a hash of the raw body.
    idempotency_key = _message_id_from(email) or hashlib.sha256(raw_body).hexdigest()[:32]

    logger.info(
        "Inbound email for %s (%s format, %d attachment(s), key %s)",
        ", ".join(email["envelope_to"]) or email["to"],
        "raw" if email["is_raw"] else "default",
        email["attachment_count"],
        idempotency_key,
    )

    # Acknowledge fast -- SendGrid is holding a mail transaction open.
    background_tasks.add_task(handle_inbound_email, email, idempotency_key)
    return JSONResponse({"received": True}, status_code=200)


def _message_id_from(email: Mapping[str, Any]) -> Optional[str]:
    """Pull Message-ID out of the header blob (default format) or MIME (raw format)."""
    source = email.get("headers") or email.get("raw_mime") or ""
    match = re.search(r"^Message-ID:\s*(.+)$", source, re.IGNORECASE | re.MULTILINE)
    return match.group(1).strip() if match else None


def handle_inbound_email(email: Mapping[str, Any], idempotency_key: str) -> None:
    """Dispatch.

    THERE ARE NO EVENT TYPES. Do not write ``if payload["event"] == ...`` --
    there is no such field. Route on the recipient: envelope_to[0] is the SMTP
    RCPT TO, i.e. the address SendGrid actually delivered to.
    """
    # TODO: check idempotency_key against your store and return early if seen.

    recipient = (email["envelope_to"][0] if email["envelope_to"] else email.get("to")) or ""
    mailbox = recipient.split("@")[0].lower()

    if mailbox == "support":
        logger.info("Support mail from %s: %s", email["from"], email["subject"])
    elif mailbox == "billing":
        logger.info("Billing mail from %s: %s", email["from"], email["subject"])
    else:
        logger.info(
            "Mail for %s from %s: %s", recipient or "(unknown)", email["from"], email["subject"]
        )

    # In raw mode there is no `text`/`html` -- only the full MIME string.
    if email["is_raw"]:
        logger.info("  raw MIME message, %d bytes", len(email["raw_mime"] or ""))
    else:
        logger.info("  text: %s", (email["text"] or "")[:80])

    # Attachments. `attachment-info` maps the multipart part names to metadata;
    # each part arrives as its own file with its own Content-Type.
    for item in email["files"]:
        info = email["attachment_info"].get(item["field"], {})
        cid = info.get("content-id")  # hyphenated inside the JSON too
        logger.info(
            "  attachment %s: %s (%s, %d bytes)%s",
            item["field"],
            info.get("filename") or item["filename"],
            info.get("type") or item["type"],
            item["size"],
            f" cid={cid}" if cid else "",
        )
        # TODO: stream item["content"] to object storage; for inline images,
        # rewrite the matching `cid:` reference in email["html"] using
        # email["content_ids"].

    # Sender authentication results describe the EMAIL, not the webhook. They
    # tell you whether to trust the message; they say nothing about whether the
    # HTTP request came from SendGrid.
    if email["spf"] and email["spf"] != "pass":
        logger.warning("  SPF result: %s", email["spf"])
    try:
        if email["spam_score"] is not None and float(email["spam_score"]) >= 5:
            logger.warning("  spam_score %s - likely spam", email["spam_score"])
    except (TypeError, ValueError):
        pass


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    if PUBLIC_KEY is None and not REQUIRE_OAUTH:
        logger.warning("No security policy configured - requests will be accepted UNVERIFIED")
        logger.warning("Set SENDGRID_INBOUND_PUBLIC_KEY, or SENDGRID_INBOUND_REQUIRE_OAUTH=true")
    uvicorn.run(app, host="0.0.0.0", port=port)
