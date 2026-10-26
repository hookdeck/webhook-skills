# Tokity Webhooks - FastAPI Example

Minimal example of receiving Tokity webhooks (ticket changes and chat sessions) and verifying
the `x-dd-signature` header, with a FastAPI dependency.

Tokity (formerly DeskDirector) signs the raw request body with HMAC-SHA256 and sends
`sha256=` plus the standard base64 digest. Nothing else is signed, so there is no timestamp
or replay window to check.

## Prerequisites

- Python 3.9+
- A Tokity webhook (or Events action) and its secret (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `TOKITY_WEBHOOK_SECRET` to the secret shown by **Display detail** on the webhook in the
   Tokity Admin Portal. Use it as shown; it is not base64 or hex.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/tokity`.

## Test

```bash
pytest test_webhook.py -v
```

The tests sign real payloads with HMAC-SHA256 (plus a vector computed with `openssl`) and
cover missing, malformed, wrong and non-canonical signatures, plus wrong-typed bodies. To try
it by hand, sign a body and post it:

```bash
BODY='[{"id":22282,"status":"New","from":null}]'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$TOKITY_WEBHOOK_SECRET" -binary | base64)
curl -X POST http://localhost:8000/webhooks/tokity \
  -H "Content-Type: application/json" \
  -H "x-dd-signature: sha256=$SIG" \
  -d "$BODY"
```

## Receive Tokity Webhooks Locally

```bash
npx hookdeck-cli listen 8000 tokity --path /webhooks/tokity
```

Use the printed URL as the receiver URL for the webhook in Tokity. Hookdeck's Tokity source
verifies the signature too, using the same secret.

## How It Works

- `main.py`: `verify_tokity_signature()`, the `verified_body` dependency and the route

1. The `verified_body` dependency reads the exact bytes with `await request.body()` and checks
   `x-dd-signature`: an optional `sha256=` prefix, then exactly 44 characters of standard
   padded base64, compared with the expected digest using `hmac.compare_digest` on bytes.
   Failure returns `401`.
2. The body is parsed as JSON and must be an object or a list of objects (`400` otherwise).
3. Tokity sends no event name. Each item is a chat session (`status` plus `pastStatus`) or a
   ticket. A ticket's `from` is its previous state (`None` on creation), so the handler diffs
   it against the current fields. Wrong-typed fields are ignored, never a `500`.
4. It returns `200 {"received": true}`.
