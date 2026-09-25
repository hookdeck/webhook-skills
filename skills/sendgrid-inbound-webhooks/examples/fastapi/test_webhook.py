# Generated with: sendgrid-inbound-webhooks skill
# https://github.com/hookdeck/webhook-skills
"""Tests for the SendGrid Inbound Parse webhook receiver.

Real P-256 keys, real ECDSA signatures, real multipart bodies with binary
attachment bytes -- the case that breaks naive implementations.
"""

import base64
import importlib
import json
import os
import time
from typing import Any, Optional

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient

# ---------------------------------------------------------------------------
# Test keys
#
# SendGrid signs with ECDSA on NIST P-256 (prime256v1) + SHA-256. That curve is
# derived from SendGrid's own documented security-policy response key
# (MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmgmjvPAR/...), which decodes to
# "ASN1 OID: prime256v1 / NIST CURVE: P-256".
#
# SENDGRID_INBOUND_PUBLIC_KEY is stored the way the API returns it: base64 DER
# SubjectPublicKeyInfo, with NO PEM armour.
# ---------------------------------------------------------------------------
PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
PUBLIC_KEY_B64 = base64.b64encode(
    PRIVATE_KEY.public_key().public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
).decode()

WRONG_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())
WRONG_PUBLIC_KEY_B64 = base64.b64encode(
    WRONG_PRIVATE_KEY.public_key().public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
).decode()

SIGNATURE_HEADER = "X-Twilio-Email-Event-Webhook-Signature"
TIMESTAMP_HEADER = "X-Twilio-Email-Event-Webhook-Timestamp"
BOUNDARY = "xYzBoUnDaRy001a11447dc881e40b0537fe6d58"
CONTENT_TYPE = f"multipart/form-data; boundary={BOUNDARY}"


# ---------------------------------------------------------------------------
# Multipart body builder
#
# Built as BYTES, not a formatted string, because attachments are binary and the
# whole point of these tests is that the signed bytes survive untouched.
# ---------------------------------------------------------------------------
def build_multipart(parts: list[dict[str, Any]]) -> bytes:
    chunks: list[bytes] = []
    for part in parts:
        header = f'--{BOUNDARY}\r\nContent-Disposition: form-data; name="{part["name"]}"'
        if part.get("filename"):
            header += f'; filename="{part["filename"]}"'
        header += "\r\n"
        if part.get("type"):
            header += f'Content-Type: {part["type"]}\r\n'
        header += "\r\n"
        chunks.append(header.encode("utf-8"))
        value = part["value"]
        chunks.append(value if isinstance(value, bytes) else value.encode("utf-8"))
        chunks.append(b"\r\n")
    chunks.append(f"--{BOUNDARY}--\r\n".encode("utf-8"))
    return b"".join(chunks)


# A real PNG header: 0x89 'P' 'N' 'G' ... These bytes are NOT valid UTF-8, so any
# code path that decodes the body to text corrupts them. That is the whole
# Inbound Parse gotcha in eleven bytes.
PNG_BYTES = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0xFF, 0xFE, 0x00])


def default_format_body() -> bytes:
    """DEFAULT data format (send_raw: false), with two attachments."""
    return build_multipart(
        [
            {
                "name": "headers",
                "value": (
                    "From: Sender Name <sender@example.com>\r\n"
                    "Message-ID: <CABQbZKGSEWPBtYVn3W_JUb70n-Oe=fykq@mail.gmail.com>\r\n"
                    "Subject: Different File Types\r\n"
                ),
            },
            # Bare string that LOOKS like JSON and is not. json.loads raises on it.
            {"name": "dkim", "value": "{@sendgrid.com : pass}"},
            {"name": "to", "value": "support@parse.example.com"},
            {"name": "from", "value": "Sender Name <sender@example.com>"},
            {"name": "subject", "value": "Different File Types"},
            {"name": "text", "value": "Here's an email with multiple attachments"},
            {
                "name": "html",
                "value": '<div dir="ltr">Here&#39;s an email<img src="cid:ii_1562e2169c132d83"></div>',
            },
            {"name": "sender_ip", "value": "209.85.223.169"},
            # JSON string. envelope.to is a SINGLE-ELEMENT ARRAY.
            {
                "name": "envelope",
                "value": '{"to":["support@parse.example.com"],"from":"sender@example.com"}',
            },
            # A COUNT, as a string -- not a list.
            {"name": "attachments", "value": "2"},
            {
                "name": "charsets",
                "value": '{"to":"UTF-8","from":"UTF-8","subject":"UTF-8","text":"UTF-8","html":"UTF-8"}',
            },
            # Upper-case field name.
            {"name": "SPF", "value": "pass"},
            {"name": "spam_score", "value": "0.011"},
            {"name": "spam_report", "value": "Spam detection software... 0.0 HTML_MESSAGE"},
            # Hyphenated field names.
            {"name": "content-ids", "value": '{"ii_1562e2169c132d83":"attachment1"}'},
            {
                "name": "attachment-info",
                "value": (
                    '{"attachment1":{"filename":"image.png","name":"image.png",'
                    '"type":"image/png","content-id":"ii_1562e2169c132d83"},'
                    '"attachment2":{"filename":"document.pdf","name":"document.pdf",'
                    '"type":"application/pdf"}}'
                ),
            },
            # Each attachment is its own multipart FILE part.
            {
                "name": "attachment1",
                "value": PNG_BYTES,
                "filename": "image.png",
                "type": "image/png",
            },
            {
                "name": "attachment2",
                "value": b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n",
                "filename": "document.pdf",
                "type": "application/pdf",
            },
        ]
    )


def raw_format_body() -> bytes:
    """RAW data format (send_raw: true): one `email` field with the whole MIME message."""
    return build_multipart(
        [
            {"name": "dkim", "value": "{@sendgrid.com : pass}"},
            {
                "name": "email",
                "value": (
                    "Received: by mx0032p1mdw1.sendgrid.net with SMTP id rOkt2xLLKV\r\n"
                    "Message-ID: <raw-format-message-id@mail.gmail.com>\r\n"
                    "Subject: Raw format\r\n"
                    "Content-Type: text/plain\r\n\r\n"
                    "The whole MIME message lives here.\r\n"
                ),
            },
            {"name": "to", "value": "billing@parse.example.com"},
            {"name": "from", "value": "sender@example.com"},
            {"name": "sender_ip", "value": "209.85.214.45"},
            {
                "name": "envelope",
                "value": '{"to":["billing@parse.example.com"],"from":"sender@example.com"}',
            },
            {"name": "subject", "value": "Raw format"},
            {"name": "charsets", "value": '{"to":"UTF-8","from":"UTF-8","subject":"UTF-8"}'},
            {"name": "SPF", "value": "pass"},
        ]
    )


def sign(raw_body: bytes, timestamp: str, key: Optional[ec.EllipticCurvePrivateKey] = None) -> str:
    """Sign exactly the way SendGrid does: timestamp bytes + raw body bytes."""
    signing_key = key or PRIVATE_KEY
    signature = signing_key.sign(
        timestamp.encode("utf-8") + raw_body, ec.ECDSA(hashes.SHA256())
    )
    return base64.b64encode(signature).decode()


def now_seconds() -> str:
    return str(int(time.time()))


def load_app(**env: str):
    """Reload the module with a specific environment.

    The module reads its config once at import time, so each configuration
    needs its own module instance.
    """
    defaults = {
        "SENDGRID_INBOUND_PUBLIC_KEY": PUBLIC_KEY_B64,
        "SENDGRID_INBOUND_MAX_AGE_SECONDS": "",
        "SENDGRID_INBOUND_REQUIRE_OAUTH": "false",
        "SENDGRID_INBOUND_OAUTH_ACCEPTED_TOKENS": "",
    }
    defaults.update(env)
    os.environ.update(defaults)
    import main

    return importlib.reload(main)


def post(client: TestClient, body: bytes, headers: Optional[dict[str, str]] = None):
    merged = {"Content-Type": CONTENT_TYPE}
    merged.update(headers or {})
    return client.post("/webhooks/sendgrid-inbound", content=body, headers=merged)


# ---------------------------------------------------------------------------
# Signature verification
# ---------------------------------------------------------------------------


def test_accepts_valid_signature_with_binary_attachments():
    module = load_app()
    body = default_format_body()
    ts = now_seconds()

    with TestClient(module.app) as client:
        res = post(client, body, {SIGNATURE_HEADER: sign(body, ts), TIMESTAMP_HEADER: ts})

    assert res.status_code == 200
    assert res.json() == {"received": True}


def test_accepts_valid_signature_over_raw_format_body():
    module = load_app()
    body = raw_format_body()
    ts = now_seconds()

    with TestClient(module.app) as client:
        res = post(client, body, {SIGNATURE_HEADER: sign(body, ts), TIMESTAMP_HEADER: ts})

    assert res.status_code == 200


def test_rejects_signature_from_a_different_key():
    module = load_app()
    body = default_format_body()
    ts = now_seconds()

    with TestClient(module.app) as client:
        res = post(
            client,
            body,
            {SIGNATURE_HEADER: sign(body, ts, WRONG_PRIVATE_KEY), TIMESTAMP_HEADER: ts},
        )

    assert res.status_code == 400
    assert res.json() == {"error": "Invalid signature"}


def test_rejects_tampered_body():
    module = load_app()
    body = default_format_body()
    ts = now_seconds()
    signature = sign(body, ts)

    # Flip one byte inside the binary attachment.
    index = body.index(PNG_BYTES)
    tampered = bytearray(body)
    tampered[index] ^= 0xFF

    with TestClient(module.app) as client:
        res = post(client, bytes(tampered), {SIGNATURE_HEADER: signature, TIMESTAMP_HEADER: ts})

    assert res.status_code == 400


def test_rejects_substituted_timestamp():
    module = load_app()
    body = default_format_body()
    ts = now_seconds()

    # The timestamp is part of the signed content.
    with TestClient(module.app) as client:
        res = post(
            client,
            body,
            {SIGNATURE_HEADER: sign(body, ts), TIMESTAMP_HEADER: str(int(ts) - 1)},
        )

    assert res.status_code == 400


def test_rejects_missing_signature_headers_when_key_configured():
    module = load_app()

    with TestClient(module.app) as client:
        res = post(client, default_format_body())

    assert res.status_code == 400
    assert res.json() == {"error": "Missing signature headers"}


def test_rejects_malformed_base64_signature_without_raising():
    module = load_app()
    body = default_format_body()

    with TestClient(module.app) as client:
        res = post(
            client,
            body,
            {SIGNATURE_HEADER: "not-a-signature!!!", TIMESTAMP_HEADER: now_seconds()},
        )

    assert res.status_code == 400
    assert res.json() == {"error": "Invalid signature"}


def test_signed_request_with_no_key_configured_returns_500_not_200():
    # Misconfiguration on our side -- never silently accept.
    module = load_app(SENDGRID_INBOUND_PUBLIC_KEY="")
    body = default_format_body()
    ts = now_seconds()

    with TestClient(module.app) as client:
        res = post(client, body, {SIGNATURE_HEADER: sign(body, ts), TIMESTAMP_HEADER: ts})

    assert res.status_code == 500


def test_accepts_unsigned_only_when_no_policy_configured_and_warns(caplog):
    # Signing is OPT-IN: with no policy attached, SendGrid sends no signature
    # header at all. That is a legitimate configuration, so accept it loudly.
    module = load_app(SENDGRID_INBOUND_PUBLIC_KEY="")

    with caplog.at_level("WARNING"):
        with TestClient(module.app) as client:
            res = post(client, default_format_body())

    assert res.status_code == 200
    assert "UNVERIFIED" in caplog.text


# ---------------------------------------------------------------------------
# The raw-body gotcha
# ---------------------------------------------------------------------------


def test_signature_fails_if_body_is_decoded_to_text_first():
    # Decoding the body to str and re-encoding is exactly what breaks Inbound
    # Parse verification: an attachment's non-UTF-8 bytes each become U+FFFD,
    # changing the SHA-256. (The Node @sendgrid/eventwebhook helper has this bug
    # -- it calls payload.toString() internally.)
    module = load_app()
    body = default_format_body()
    ts = now_seconds()
    signature = sign(body, ts)
    key = module.load_public_key(PUBLIC_KEY_B64)

    # The correct path: raw bytes.
    assert module.verify_inbound_parse_signature(body, signature, ts, key) is True

    # The broken path: bytes -> str -> bytes.
    round_tripped = body.decode("utf-8", errors="replace").encode("utf-8")
    assert round_tripped != body  # lossy, and that is the point
    assert module.verify_inbound_parse_signature(round_tripped, signature, ts, key) is False


def test_calling_form_before_body_is_the_documented_mistake():
    """Show why the order in the handler matters, at the Starlette level."""
    from starlette.requests import Request

    module = load_app()
    body = default_format_body()

    async def receive():
        return {"type": "http.request", "body": body, "more_body": False}

    scope = {
        "type": "http",
        "method": "POST",
        "path": "/webhooks/sendgrid-inbound",
        "headers": [(b"content-type", CONTENT_TYPE.encode())],
        "query_string": b"",
    }

    import asyncio

    async def body_first() -> bytes:
        request = Request(scope, receive)
        raw = await request.body()  # FIRST -- Starlette caches this...
        await request.form()  # ...so this replays the cached bytes safely.
        return raw

    assert asyncio.run(body_first()) == body


def test_load_public_key_accepts_der_and_pem_identically():
    module = load_app()
    body = default_format_body()
    ts = now_seconds()
    signature = sign(body, ts)

    from_der = module.load_public_key(PUBLIC_KEY_B64)
    from_pem = module.load_public_key(
        f"-----BEGIN PUBLIC KEY-----\n{PUBLIC_KEY_B64}\n-----END PUBLIC KEY-----\n"
    )

    assert module.verify_inbound_parse_signature(body, signature, ts, from_der) is True
    assert module.verify_inbound_parse_signature(body, signature, ts, from_pem) is True


def test_load_public_key_returns_none_on_garbage():
    module = load_app()
    assert module.load_public_key("not a key") is None
    assert module.load_public_key("") is None
    assert module.load_public_key(None) is None


def test_rejects_signature_against_the_wrong_public_key():
    module = load_app()
    body = default_format_body()
    ts = now_seconds()
    key = module.load_public_key(WRONG_PUBLIC_KEY_B64)
    assert module.verify_inbound_parse_signature(body, sign(body, ts), ts, key) is False


# ---------------------------------------------------------------------------
# Replay protection (opt-in)
# ---------------------------------------------------------------------------


def test_replay_check_is_disabled_by_default():
    module = load_app()
    body = default_format_body()
    ts = str(int(time.time()) - 86400)

    with TestClient(module.app) as client:
        res = post(client, body, {SIGNATURE_HEADER: sign(body, ts), TIMESTAMP_HEADER: ts})

    assert res.status_code == 200


def test_rejects_stale_timestamp_when_window_configured():
    module = load_app(SENDGRID_INBOUND_MAX_AGE_SECONDS="300")
    body = default_format_body()
    ts = str(int(time.time()) - 3600)

    with TestClient(module.app) as client:
        res = post(client, body, {SIGNATURE_HEADER: sign(body, ts), TIMESTAMP_HEADER: ts})

    assert res.status_code == 400


def test_accepts_fresh_timestamp_when_window_configured():
    module = load_app(SENDGRID_INBOUND_MAX_AGE_SECONDS="300")
    body = default_format_body()
    ts = now_seconds()

    with TestClient(module.app) as client:
        res = post(client, body, {SIGNATURE_HEADER: sign(body, ts), TIMESTAMP_HEADER: ts})

    assert res.status_code == 200


# ---------------------------------------------------------------------------
# OAuth verification (RFC 6750 response contract)
# ---------------------------------------------------------------------------

OAUTH_ENV = {
    "SENDGRID_INBOUND_PUBLIC_KEY": "",
    "SENDGRID_INBOUND_REQUIRE_OAUTH": "true",
    "SENDGRID_INBOUND_OAUTH_ACCEPTED_TOKENS": "good-token",
}


def test_oauth_accepts_valid_bearer_token():
    module = load_app(**OAUTH_ENV)

    with TestClient(module.app) as client:
        res = post(client, default_format_body(), {"Authorization": "Bearer good-token"})

    assert res.status_code == 200


def test_oauth_bad_token_returns_401_and_invalid_token():
    # SendGrid CACHES the access token. This exact string is what makes it fetch
    # a fresh one; a bare 401 leaves the stale token cached forever.
    module = load_app(**OAUTH_ENV)

    with TestClient(module.app) as client:
        res = post(client, default_format_body(), {"Authorization": "Bearer stale-token"})

    assert res.status_code == 401
    assert "invalid_token" in res.text


def test_oauth_missing_header_returns_400_and_invalid_request():
    module = load_app(**OAUTH_ENV)

    with TestClient(module.app) as client:
        res = post(client, default_format_body())

    assert res.status_code == 400
    assert "invalid_request" in res.text


def test_oauth_malformed_header_returns_400_and_invalid_request():
    module = load_app(**OAUTH_ENV)

    with TestClient(module.app) as client:
        res = post(client, default_format_body(), {"Authorization": "Basic Zm9vOmJhcg=="})

    assert res.status_code == 400
    assert "invalid_request" in res.text


def test_oauth_error_codes_map_to_400_401_403():
    module = load_app()
    assert module.OAUTH_ERRORS == {
        "invalid_request": 400,
        "invalid_token": 401,
        "insufficient_scope": 403,
    }


def test_hybrid_enforces_both_oauth_and_signature():
    module = load_app(**{**OAUTH_ENV, "SENDGRID_INBOUND_PUBLIC_KEY": PUBLIC_KEY_B64})
    body = default_format_body()
    ts = now_seconds()

    with TestClient(module.app) as client:
        bad = post(
            client,
            body,
            {
                "Authorization": "Bearer good-token",
                SIGNATURE_HEADER: sign(body, ts, WRONG_PRIVATE_KEY),
                TIMESTAMP_HEADER: ts,
            },
        )
        assert bad.status_code == 400

        good = post(
            client,
            body,
            {
                "Authorization": "Bearer good-token",
                SIGNATURE_HEADER: sign(body, ts),
                TIMESTAMP_HEADER: ts,
            },
        )
        assert good.status_code == 200


# ---------------------------------------------------------------------------
# Payload parsing
# ---------------------------------------------------------------------------


def test_normalizes_the_default_format():
    module = load_app()
    fields = {
        "headers": "Message-ID: <abc@example.com>",
        "dkim": "{@sendgrid.com : pass}",
        "to": "support@parse.example.com",
        "from": "Sender Name <sender@example.com>",
        "subject": "Different File Types",
        "text": "hello",
        "html": "<p>hello</p>",
        "sender_ip": "209.85.223.169",
        "envelope": '{"to":["support@parse.example.com"],"from":"sender@example.com"}',
        "attachments": "2",
        "charsets": '{"to":"UTF-8","text":"UTF-8"}',
        "SPF": "pass",
        "spam_score": "0.011",
        "spam_report": "Spam detection software...",
        "content-ids": '{"ii_1562e2169c132d83":"attachment1"}',
        "attachment-info": (
            '{"attachment1":{"filename":"image.png","name":"image.png",'
            '"type":"image/png","content-id":"ii_1562e2169c132d83"}}'
        ),
    }
    email = module.normalize_inbound_email(fields, [])

    assert email["is_raw"] is False
    # envelope is a JSON STRING; envelope.to is a single-element LIST.
    assert email["envelope_to"] == ["support@parse.example.com"]
    assert email["envelope_from"] == "sender@example.com"
    # `SPF` is upper-case on the wire.
    assert email["spf"] == "pass"
    # `dkim` is NOT JSON -- it must survive as the bare string it is.
    assert email["dkim"] == "{@sendgrid.com : pass}"
    with pytest.raises(ValueError):
        json.loads(email["dkim"])
    # `attachments` is a COUNT, not a list.
    assert email["attachment_count"] == 2
    # Hyphenated field names, parsed from JSON strings.
    assert email["attachment_info"]["attachment1"]["filename"] == "image.png"
    assert email["attachment_info"]["attachment1"]["content-id"] == "ii_1562e2169c132d83"
    assert email["content_ids"] == {"ii_1562e2169c132d83": "attachment1"}
    assert email["charsets"]["text"] == "UTF-8"
    assert email["spam_score"] == "0.011"


def test_normalizes_the_raw_format():
    module = load_app()
    email = module.normalize_inbound_email(
        {
            "dkim": "{@sendgrid.com : pass}",
            "email": "Subject: Raw format\r\n\r\nbody",
            "to": "billing@parse.example.com",
            "envelope": '{"to":["billing@parse.example.com"],"from":"sender@example.com"}',
            "SPF": "pass",
        },
        [],
    )

    assert email["is_raw"] is True
    assert "Subject: Raw format" in email["raw_mime"]
    assert email["envelope_to"] == ["billing@parse.example.com"]
    # Raw mode has none of these fields.
    assert email["headers"] is None
    assert email["text"] is None
    assert email["html"] is None
    assert email["attachment_info"] == {}
    assert email["content_ids"] == {}
    assert email["files"] == []


def test_survives_malformed_json_fields():
    module = load_app()
    email = module.normalize_inbound_email(
        {"envelope": "{not json", "charsets": "", "attachment-info": "nope"}, []
    )
    assert email["envelope_to"] == []
    assert email["charsets"] == {}
    assert email["attachment_info"] == {}


def test_attachment_bytes_survive_the_round_trip(caplog):
    """The handler must see the PNG bytes unchanged after parsing."""
    module = load_app()
    body = default_format_body()
    ts = now_seconds()
    captured: list[dict[str, Any]] = []

    original = module.handle_inbound_email

    def capture(email, key):
        captured.append(email)
        return original(email, key)

    module.handle_inbound_email = capture
    try:
        with TestClient(module.app) as client:
            res = post(client, body, {SIGNATURE_HEADER: sign(body, ts), TIMESTAMP_HEADER: ts})
    finally:
        module.handle_inbound_email = original

    assert res.status_code == 200
    assert len(captured) == 1
    email = captured[0]
    assert email["attachment_count"] == 2
    png = next(f for f in email["files"] if f["field"] == "attachment1")
    assert png["filename"] == "image.png"
    assert png["type"] == "image/png"
    assert png["content"] == PNG_BYTES
    assert len(email["files"]) == 2
    # No event-type field exists on an Inbound Parse payload.
    assert "event" not in email
    assert email["envelope_to"] == ["support@parse.example.com"]


# ---------------------------------------------------------------------------
# Endpoint behaviour
# ---------------------------------------------------------------------------


def test_health_check():
    module = load_app()
    with TestClient(module.app) as client:
        res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_unknown_path_404s():
    module = load_app()
    with TestClient(module.app) as client:
        res = client.get("/nope")
    assert res.status_code == 404
