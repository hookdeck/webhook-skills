# SendGrid Inbound Parse Webhooks — FastAPI Example

Receives **inbound email** from Twilio SendGrid Inbound Parse and verifies the
ECDSA signature over the raw `multipart/form-data` body.

This is Inbound Parse, **not** the SendGrid Event Webhook (`delivered`,
`bounce`, `open`, `click`). The two share the ECDSA primitive and the same two
header names, and nothing else. There are **no event types** here — the only
"event" is an email arriving, so the handler routes on the recipient
(`envelope.to`).

## Prerequisites

- Python 3.9+
- A SendGrid account with an authenticated domain and an MX record pointing at
  `mx.sendgrid.net`
- Optional but recommended: a webhook **security policy** with signature
  verification enabled, attached to your Parse Setting

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Put your public key in `.env` as `SENDGRID_INBOUND_PUBLIC_KEY`.

   It is the `policy.signature.public_key` value from
   `POST /v3/user/webhooks/security/policies` — **base64 DER, not PEM**. Paste
   it exactly as the API returned it.

   Leave it empty only if your Parse Setting genuinely has no security policy
   attached. SendGrid then sends no signature header at all and the app accepts
   requests with a loud warning. Once the key is set, verification is strictly
   enforced and never falls back.

## Run

```bash
python main.py
# or: uvicorn main:app --reload --port 8000
```

Endpoint: `POST http://localhost:8000/webhooks/sendgrid-inbound`

## Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 sendgrid-inbound --path /webhooks/sendgrid-inbound
```

Point your Parse Setting's `url` at the URL the CLI prints. No account required
— the CLI creates a guest account on first run and gives you a web UI for
inspecting and **replaying** requests, which matters here: an inbound email is
not repeatable, so replaying a captured multipart body byte-for-byte is the
practical way to iterate on attachment handling.

## Test

```bash
pytest test_webhook.py -v
```

The suite generates real P-256 keys and real signatures, and covers:

- valid signatures over both the default and raw (`send_raw`) payload formats
- a body containing **binary attachment bytes** — the case that breaks naive
  implementations, verified end to end (the PNG bytes come back out of the
  parser byte-for-byte)
- the regression that breaks text-decoding verifiers: the same valid signature
  fails once the body has been round-tripped through `str`
- a Starlette-level demonstration that `await request.body()` before
  `await request.form()` is what keeps the raw bytes available
- tampered bodies, substituted timestamps, wrong keys, missing headers,
  malformed base64
- the opt-in replay window, off by default and enforced when configured
- the OAuth path and its RFC 6750 response contract (400/`invalid_request`,
  401/`invalid_token`, 403/`insufficient_scope`)
- field-level parsing traps: upper-case `SPF`, hyphenated `content-ids` /
  `attachment-info`, `envelope.to` as a single-element list, `attachments` as a
  count, and `dkim` as a bare string that is *not* JSON

## Key implementation points

**`await request.body()` comes first. Always.**

```python
raw_body = await request.body()   # FIRST. Starlette caches this…
# …verify…
form = await request.form()       # …so this replays the cached bytes safely.
```

SendGrid's docs warn under an explicit WARNING that frameworks which auto-parse
multipart data break signature validation, and instruct: *"Do not parse or
modify the request body before validating the signature."*

Calling `await request.form()` first **consumes the stream** — a later
`await request.body()` returns nothing useful and verification can never
succeed. The order is load-bearing, and `test_webhook.py` has a test that
pins it.

**Verification is ECDSA, not HMAC.** P-256 + SHA-256 over
`timestamp.encode() + raw_body`, signature base64 of an ASN.1/DER `(r, s)`
SEQUENCE. `ec.ECDSA(hashes.SHA256())` expects DER, so there is no r/s
splitting — do not convert to raw/P1363 form.

**Key loading uses `load_der_public_key`, not `load_pem_public_key`.** The value
SendGrid returns has no PEM armour; the PEM loader raises on it. Both forms are
accepted by `load_public_key()` in `main.py`.

**`python-multipart` is required** for `request.form()` to parse
`multipart/form-data` at all — but note that parsing happens strictly after
verification.

See [../../references/verification.md](../../references/verification.md) for the
full breakdown and a debugging table.
