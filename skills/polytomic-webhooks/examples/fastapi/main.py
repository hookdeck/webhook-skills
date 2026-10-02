# Generated with: polytomic-webhooks skill
# https://github.com/hookdeck/webhook-skills
import hmac
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple, Union

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()

# Polytomic Webhook destination receiver.
#
# Polytomic is a data-movement platform. Its one outbound-HTTP surface is the
# Webhook *connection used as a sync destination*: you add a Webhook connection,
# point a Model Sync at it, and Polytomic POSTs BATCHES OF CHANGED RECORDS to
# your URL on the sync's schedule. This is not event subscription — there is no
# event-subscription UI and no per-event-type toggles.
#
# Three things make Polytomic unlike most providers:
#
#   1. THERE IS NO SIGNATURE. No HMAC, no digest, no signing secret, no
#      signature header, and no X-Polytomic-* header of any kind. The ONLY
#      authentication is a STATIC SHARED BEARER TOKEN matching the connection
#      Secret. Verbatim from the docs: "This should be a 'Bearer' token matching
#      the same value that was provided as the 'Secret' during connection setup.
#      For now, this is the only request authorization and is a static value."
#      Note: hashlib is not imported and hmac.new() is never called in this file.
#      `hmac.compare_digest` is used purely as Python's constant-time BYTE
#      COMPARISON — no HMAC is computed, because there is no signature to
#      compare a digest against.
#
#      There is also no Polytomic SDK webhook verifier to fall back from: no SDK
#      helper exists, because there is no signature scheme to wrap. Manual
#      comparison is the implementation in every language.
#
#   2. `Polytomic-Signature-Timestamp` IS NOT A SIGNATURE, despite its name. It
#      carries only an RFC 3339 / ISO 8601 UTC timestamp ("2021-06-01T22:55:36Z")
#      — not a Unix epoch integer and not a digest. Parse it with
#      datetime.fromisoformat(), NEVER int(). The freshness check below is
#      defence-in-depth only: the timestamp is not covered by any signature, so
#      an attacker holding the bearer token can set any value they like.
#
#   3. EVERY PAYLOAD IS A BATCH. `object.records` is "a list of the records
#      changed since the last payload" — default batch size 100, and
#      user-configurable. We always loop. Never assume one record.
#
# Because there is no signature, there is NO raw-body requirement here — we can
# use `await request.json()` rather than capturing `await request.body()`.
# (Polytomic may gzip the body; your ASGI server / reverse proxy decompresses
# that transparently.)

app = FastAPI(title="Polytomic Webhook Handler")

# Default freshness window, in seconds — the docs' "more than a few minutes old".
DEFAULT_TOLERANCE_SECONDS = 300

if not os.getenv("POLYTOMIC_WEBHOOK_SECRET"):
    print(
        "WARNING: POLYTOMIC_WEBHOOK_SECRET is not set — the webhook route will "
        "fail closed with 500. Polytomic does not sign its payloads, so this "
        "shared bearer token is the ONLY authentication available. Reveal it by "
        "hovering the secret key field on the Webhook connection in Polytomic."
    )


def webhook_secret() -> str:
    """Read per request, so the fail-closed path stays testable and a rotation
    doesn't need a restart."""
    return os.getenv("POLYTOMIC_WEBHOOK_SECRET") or ""


def tolerance_seconds() -> int:
    raw = os.getenv("POLYTOMIC_TIMESTAMP_TOLERANCE_SECONDS")
    if raw is None or raw == "":
        return DEFAULT_TOLERANCE_SECONDS
    try:
        return int(raw)
    except ValueError:
        return DEFAULT_TOLERANCE_SECONDS


def verify_bearer_token(
    authorization_header: Optional[str], secret: Optional[str]
) -> Optional[bool]:
    """
    Authenticate the request by comparing the Authorization bearer token against
    the connection Secret, in constant time.

    This is the WHOLE of Polytomic's authentication. There is no signature to
    verify: no HMAC is computed here, because no signature header is sent.

    The documented sample token happens to decode as an HS256 JWT (claims
    {"aud":"webhook","jti":"<uuid>","iss":"https://app.polytomic-local.com:8443/"}
    — `iss` is the issuing Polytomic instance, and the docs' example is a local
    dev host). Do NOT treat it as a JWT: it is signed with a key Polytomic does
    not give you, it carries no `exp`, and the docs call it "a static value".
    Calling jwt.decode()/jwt.verify() or checking aud/iss/exp would either raise
    or add a false sense of security. Compare the whole string byte-for-byte.

    Returns None when unconfigured — the caller MUST fail closed with 500.
    """
    if not secret:
        return None  # unset => fail closed, never silently accept
    if not authorization_header:
        return False

    # Strip exactly ONE leading "Bearer " prefix. The scheme is case-insensitive
    # per RFC 7235; the token after it is not.
    token = authorization_header
    if token[:7].lower() == "bearer ":
        token = token[7:]

    # Compare BYTES, not str: hmac.compare_digest() raises TypeError on str
    # values containing non-ASCII characters, and the header is attacker-supplied.
    # Note this computes NO HMAC — it is just a constant-time byte comparison.
    return hmac.compare_digest(token.encode("utf-8"), secret.encode("utf-8"))


def timestamp_is_fresh(
    timestamp_header: Optional[str], tolerance: Optional[int] = None
) -> bool:
    """
    Optional freshness check on Polytomic-Signature-Timestamp.

    The docs endorse this: "In general, it is a good idea to reject requests
    older than you expect (more than a few minutes old)." But the timestamp is
    NOT covered by any signature, so this proves nothing about authenticity — it
    only limits replay of an OLD CAPTURED REQUEST.

    The value is RFC 3339 UTC, e.g. "2021-06-01T22:55:36Z". NEVER int() it.

    `tolerance` in seconds; <= 0 disables the check.
    """
    if tolerance is None:
        tolerance = tolerance_seconds()
    if tolerance <= 0:
        return True  # check disabled
    if not timestamp_header or not timestamp_header.strip():
        return False

    value = timestamp_header.strip()
    try:
        # datetime.fromisoformat() only accepts a literal trailing "Z" on Python
        # 3.11+, so normalise it to "+00:00" for 3.9/3.10 compatibility.
        if value.endswith(("Z", "z")):
            value = value[:-1] + "+00:00"
        sent = datetime.fromisoformat(value)
    except ValueError:
        return False

    # The docs' format is explicitly UTC; assume UTC if an offset is missing.
    if sent.tzinfo is None:
        sent = sent.replace(tzinfo=timezone.utc)

    delta = abs((datetime.now(timezone.utc) - sent).total_seconds())
    return delta <= tolerance


def parse_envelope(
    payload: Any,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """
    Defensive validation of the documented envelope.

    Documented shape:
      {"event": "sync.records",
       "object": {"id": "<sync uuid>", "name": "<sync name>",
                  "records": [{"hash": "...", "fields": {...}}],
                  "metadata": {}}}

    `object` is "an envelope that will contain the payload, regardless of event"
    and is always present. `metadata` defaults to null in the sync
    configuration, so it may be a dict, None, OR ABSENT — all three are handled.

    Returns (envelope, None) on success or (None, error) on failure.
    """
    if not isinstance(payload, dict):
        return None, "payload is not a JSON object"

    event = payload.get("event")
    if not isinstance(event, str) or event == "":
        return None, "missing or invalid event"

    envelope = payload.get("object")
    if not isinstance(envelope, dict):
        return None, "missing or invalid object envelope"

    # `records` is absent on event types we don't know about yet, so it is only
    # required for sync.records.
    records = envelope.get("records")
    if records is not None and not isinstance(records, list):
        return None, "object.records is not an array"

    metadata = envelope.get("metadata")

    return (
        {
            "event": event,
            # The UUID of the SYNC (it matches the id in the Polytomic UI's URL
            # bar for that sync config) — not of the delivery or the record.
            "sync_id": envelope.get("id") if isinstance(envelope.get("id"), str) else None,
            # The sync's name: "useful for discriminating against data coming in
            # from different endpoints."
            "sync_name": envelope.get("name") if isinstance(envelope.get("name"), str) else None,
            "records": records if isinstance(records, list) else [],
            # Absent / None / dict all collapse to None-or-dict here.
            "metadata": metadata if isinstance(metadata, dict) else None,
        },
        None,
    )


def normalize_record(record: Any) -> Optional[Dict[str, Any]]:
    """
    Normalize one record from the batch.

    `fields` "contains each of the fields you selected to be delivered" — THE
    KEYS ARE USER-DEFINED by the sync configuration. The `email` / `last_login`
    in the docs' example are that customer's chosen fields, NOT a Polytomic
    schema. So this is deliberately NOT modelled as a fixed shape (no Pydantic
    model over `fields`); access it defensively.

    `hash` is "a computed hash of the record's fields key/values pairs, which may
    be useful for deduplicating incoming data" — i.e. an idempotency key. Its
    algorithm and length are undocumented, so never recompute or assume them,
    and NEVER use it for authentication: it is a digest over data Polytomic is
    sending you, computed by Polytomic.

    Returns None if the record is unusable.
    """
    if not isinstance(record, dict):
        return None

    raw_fields = record.get("fields")
    fields: Dict[str, Any] = raw_fields if isinstance(raw_fields, dict) else {}

    record_hash = record.get("hash")
    return {
        "hash": record_hash if isinstance(record_hash, str) and record_hash != "" else None,
        "fields": fields,
    }


def handle_sync_records(envelope: Dict[str, Any]) -> None:
    """
    Handle the sync.records batch.

    ALWAYS LOOPS. Default batch size is 100 ("Webhook batch size (default: 100)"
    under the sync's Advanced settings) and it is user-configurable, so never
    assume one record and write for large batches.

    In production, hand this to a background task or queue — the route returns
    200 first. A 4xx/5xx "will cause the sync to appear as a failure", so a slow
    downstream would fail your customer's whole sync run.
    """
    records: List[Any] = envelope["records"]
    print(
        f"Polytomic sync.records: sync \"{envelope['sync_name'] or 'unknown'}\" "
        f"({envelope['sync_id'] or 'no id'}) delivered {len(records)} record(s)"
    )

    if envelope["metadata"]:
        # Hardcoded key/values from Advanced settings -> Metadata (default: null).
        print(f"  metadata: {envelope['metadata']}")

    for raw in records:
        record = normalize_record(raw)
        if record is None:
            print("  skipping malformed record in batch")
            continue

        # TODO: replace with your own processing, and dedupe on
        # f"{envelope['sync_id']}:{record['hash']}" so a redelivered batch is a
        # no-op. The field KEYS below come from the sync configuration, so read
        # them defensively — any key may be absent and any value may be None.
        field_names = list(record["fields"].keys())
        print(
            f"  record {record['hash'] or '(no hash)'}: {len(field_names)} field(s) "
            f"[{', '.join(field_names)}]"
        )


@app.post("/webhooks/polytomic")
async def polytomic_webhook(request: Request) -> JSONResponse:
    # 1. Fail closed when no secret is configured. On a provider with NO
    #    signature, the bearer token is the entire security boundary — treating
    #    "unconfigured" as "accept everything" leaves a fully open endpoint that
    #    looks secure.
    #
    #    Header names are matched case-insensitively by Starlette's Headers.
    auth_result = verify_bearer_token(request.headers.get("authorization"), webhook_secret())
    if auth_result is None:
        print("Polytomic webhook refused: POLYTOMIC_WEBHOOK_SECRET is not set")
        return JSONResponse({"error": "Webhook secret not configured"}, status_code=500)
    if auth_result is False:
        print("Polytomic webhook rejected: bearer token mismatch")
        return JSONResponse({"error": "Invalid bearer token"}, status_code=401)

    # 2. Optional freshness check. Defence-in-depth only — see timestamp_is_fresh.
    if not timestamp_is_fresh(request.headers.get("polytomic-signature-timestamp")):
        print("Polytomic webhook rejected: stale or unparseable timestamp")
        return JSONResponse({"error": "Stale or invalid timestamp"}, status_code=400)

    # 3. Parse the body. No signature means no raw-body requirement.
    try:
        payload = await request.json()
    except Exception:
        print("Polytomic webhook rejected: invalid JSON body")
        return JSONResponse({"error": "Invalid JSON"}, status_code=400)

    envelope, error = parse_envelope(payload)
    if error is not None or envelope is None:
        print(f"Polytomic webhook rejected: {error}")
        return JSONResponse({"error": error}, status_code=400)

    # 4. Dispatch on the event type. There is EXACTLY ONE documented event:
    #    sync.records. "You should only process webhooks you know about—for right
    #    now, that is just the sync.records event."
    #
    #    In a real deployment, enqueue here (or use a BackgroundTask) so the 200
    #    below is returned immediately. "On receipt of the payload, your API
    #    should return 200 OK. Any 4xx or 5xx error will cause the sync to appear
    #    as a failure", and no retry policy is documented.
    if envelope["event"] == "sync.records":
        handle_sync_records(envelope)
    else:
        # IGNORE unknown events — do NOT error. The docs explicitly anticipate
        # future event types, and a 4xx would mark the customer's sync run failed.
        print(f"Polytomic webhook: ignoring unknown event \"{envelope['event']}\"")

    return JSONResponse({"received": True}, status_code=200)


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host="0.0.0.0", port=port)
